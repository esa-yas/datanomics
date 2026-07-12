import type { Server } from 'node:http';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { TranscriptMessage } from '@elevenlabs/elevenlabs-js/wrapper/speech-engine/types';
import { isAbortError } from '@elevenlabs/elevenlabs-js/wrapper/speech-engine/types';
import { logger } from '../logger';
import { interviewPracticeEnv } from './env';
import { generateInterviewFeedback } from './feedback';
import { generateOpeningLine, streamInterviewerResponse } from './interviewerLlm';
import { buildInterviewerSystemPrompt } from './prompt';
import {
  appendInterviewMessage,
  markSessionStarted,
  type InterviewSessionRow,
} from './sessions';

const SPEECH_WS_PATH = '/api/interview-practice/speech-engine/ws';

interface InterviewLiveContext {
  session: InterviewSessionRow;
  candidateName: string;
  startedAt: number;
  durationMs: number;
  rollingSummary: string;
  ended: boolean;
  lastUserText: string;
  lastAgentText: string;
  greeted: boolean;
}

let elevenLabs: ElevenLabsClient | null = null;
let engineId: string | null = null;
let speechReady = false;
let speechInitError: string | null = null;

const pendingSessionIds: string[] = [];
const conversations = new Map<string, InterviewLiveContext>();

function buildContext(session: InterviewSessionRow, candidateName: string): InterviewLiveContext {
  return {
    session,
    candidateName,
    startedAt: Date.now(),
    durationMs: session.duration_minutes * 60_000,
    rollingSummary: session.rolling_summary ?? '',
    ended: false,
    lastUserText: '',
    lastAgentText: '',
    greeted: false,
  };
}

function associateConversation(conversationId: string): InterviewLiveContext | null {
  const sessionId = pendingSessionIds.shift();
  if (!sessionId) {
    logger.warn({ conversationId }, 'No pending interview session for Speech Engine connection');
    return null;
  }
  const ctx = conversations.get(`pending:${sessionId}`);
  if (!ctx) {
    logger.warn({ conversationId, sessionId }, 'Interview context missing for Speech Engine');
    return null;
  }
  conversations.delete(`pending:${sessionId}`);
  conversations.set(conversationId, ctx);
  return ctx;
}

async function persistUser(ctx: InterviewLiveContext, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || trimmed === ctx.lastUserText) return;
  ctx.lastUserText = trimmed;
  await appendInterviewMessage(ctx.session.id, 'candidate', trimmed);
}

async function persistAgent(ctx: InterviewLiveContext, text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || trimmed === ctx.lastAgentText) return;
  ctx.lastAgentText = trimmed;
  await appendInterviewMessage(ctx.session.id, 'ai', trimmed);
}

async function endInterview(ctx: InterviewLiveContext, reason: string): Promise<void> {
  if (ctx.ended) return;
  ctx.ended = true;
  try {
    await appendInterviewMessage(ctx.session.id, 'system', reason);
    await generateInterviewFeedback(ctx.session);
  } catch (err) {
    logger.error({ err, sessionId: ctx.session.id }, 'Failed to finalize interview');
  }
}

async function handleTranscript(
  transcript: TranscriptMessage[],
  signal: AbortSignal,
  conversationId: string | undefined,
  sendResponse: (response: string | AsyncIterable<unknown>) => Promise<void>,
): Promise<void> {
  const ctx = conversationId ? conversations.get(conversationId) : undefined;
  if (!ctx || ctx.ended) return;

  if (Date.now() - ctx.startedAt >= ctx.durationMs) {
    await endInterview(ctx, 'Interview time limit reached');
    return;
  }

  const userLines = transcript.filter((t) => t.role === 'user');
  const lastUser = userLines[userLines.length - 1];
  if (lastUser?.content) {
    await persistUser(ctx, lastUser.content);
  }

  const systemPrompt = buildInterviewerSystemPrompt({
    candidateName: ctx.candidateName,
    title: ctx.session.title,
    jobDescription: ctx.session.job_description,
    resumeText: ctx.session.resume_text,
    focusNotes: ctx.session.focus_notes,
    interviewType: ctx.session.interview_type,
    difficulty: ctx.session.difficulty,
    durationMinutes: ctx.session.duration_minutes,
    rollingSummary: ctx.rollingSummary,
  });

  let fullResponse = '';
  async function* teeStream(): AsyncGenerator<string> {
    for await (const chunk of streamInterviewerResponse(systemPrompt, transcript, signal)) {
      fullResponse += chunk;
      yield chunk;
    }
  }

  try {
    await sendResponse(teeStream());
    await persistAgent(ctx, fullResponse);
  } catch (err) {
    if (isAbortError(err)) return;
    throw err;
  }
}

export function isSpeechEngineReady(): boolean {
  return speechReady;
}

export function speechEngineStatus(): { ready: boolean; engineId: string | null; error: string | null } {
  return { ready: speechReady, engineId, error: speechInitError };
}

export function speechEnginePublicWsPath(): string {
  return SPEECH_WS_PATH;
}

export function reserveInterviewSession(
  session: InterviewSessionRow,
  candidateName: string,
): void {
  const ctx = buildContext(session, candidateName);
  conversations.set(`pending:${session.id}`, ctx);
  pendingSessionIds.push(session.id);
}

export async function initInterviewSpeechEngine(httpServer: Server): Promise<void> {
  const apiKey = interviewPracticeEnv.elevenLabsApiKey;
  const publicWsUrl = interviewPracticeEnv.speechEnginePublicWsUrl;

  if (!apiKey) {
    speechInitError = 'ELEVENLABS_API_KEY is not configured';
    logger.warn(speechInitError);
    return;
  }
  if (!publicWsUrl) {
    speechInitError =
      'INTERVIEW_SPEECH_WS_PUBLIC_URL is not configured (ElevenLabs must reach your api-server WebSocket — use ngrok for local dev)';
    logger.warn(speechInitError);
    return;
  }

  elevenLabs = new ElevenLabsClient({ apiKey });
  let id = interviewPracticeEnv.speechEngineId;

  try {
    if (!id) {
      const created = await elevenLabs.speechEngine.create({
        name: 'Job Search OS — Interview Practice',
        speechEngine: { wsUrl: publicWsUrl },
        overrides: { firstMessage: true },
        privacy: { recordVoice: false },
      });
      id = created.engineId;
      logger.info(
        { engineId: id, publicWsUrl },
        'Created ElevenLabs Speech Engine — save ELEVENLABS_SPEECH_ENGINE_ID in .env',
      );
    } else {
      await elevenLabs.speechEngine.update(id, {
        speechEngine: { wsUrl: publicWsUrl },
        overrides: { firstMessage: true },
        privacy: { recordVoice: false },
      });
    }

    engineId = id;
    const engine = await elevenLabs.speechEngine.get(id);

    engine.attach(httpServer, SPEECH_WS_PATH, {
      debug: process.env.NODE_ENV === 'development',
      onInit: async (conversationId, session) => {
        const ctx = associateConversation(conversationId);
        if (!ctx || ctx.greeted) return;
        ctx.greeted = true;

        const systemPrompt = buildInterviewerSystemPrompt({
          candidateName: ctx.candidateName,
          title: ctx.session.title,
          jobDescription: ctx.session.job_description,
          resumeText: ctx.session.resume_text,
          focusNotes: ctx.session.focus_notes,
          interviewType: ctx.session.interview_type,
          difficulty: ctx.session.difficulty,
          durationMinutes: ctx.session.duration_minutes,
          rollingSummary: ctx.rollingSummary,
        });

        const controller = new AbortController();
        const opening = await generateOpeningLine(systemPrompt, controller.signal);
        await session.sendResponse(opening);
        await persistAgent(ctx, opening);
      },
      onTranscript: async (transcript, signal, session) => {
        await handleTranscript(transcript, signal, session.conversationId, (r) => session.sendResponse(r));
      },
      onClose: (session) => {
        const ctx = session.conversationId ? conversations.get(session.conversationId) : undefined;
        if (ctx) void endInterview(ctx, 'Interview ended');
        if (session.conversationId) conversations.delete(session.conversationId);
      },
      onDisconnect: (session) => {
        const ctx = session.conversationId ? conversations.get(session.conversationId) : undefined;
        if (ctx) void endInterview(ctx, 'Connection lost');
        if (session.conversationId) conversations.delete(session.conversationId);
      },
      onError: (error, session) => {
        logger.error({ err: error, conversationId: session.conversationId }, 'Speech Engine session error');
      },
    });

    speechReady = true;
    speechInitError = null;
    logger.info({ engineId: id, publicWsUrl }, 'ElevenLabs Speech Engine attached');
  } catch (err) {
    speechInitError = err instanceof Error ? err.message : 'Speech Engine init failed';
    logger.error({ err }, speechInitError);
  }
}

export async function issueVoiceConversationToken(
  session: InterviewSessionRow,
  candidateName: string,
): Promise<{ token: string }> {
  if (!speechReady || !elevenLabs || !engineId) {
    throw new Error(speechInitError ?? 'Voice interviewer is not configured on the server');
  }

  await markSessionStarted(session.id);
  reserveInterviewSession(session, candidateName);

  const response = await elevenLabs.conversationalAi.conversations.getWebrtcToken({
    agentId: engineId,
    participantName: session.id,
  });

  const token = response.token;
  if (!token) throw new Error('ElevenLabs did not return a conversation token');
  return { token };
}
