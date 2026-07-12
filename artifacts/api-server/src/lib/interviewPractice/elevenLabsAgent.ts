import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { logger } from '../logger';
import { interviewPracticeEnv } from './env';
import { buildVoiceInterviewerSystemPrompt } from './prompt';
import {
  appendInterviewMessage,
  getSessionMessages,
  markSessionStarted,
  type InterviewSessionRow,
} from './sessions';

let elevenLabs: ElevenLabsClient | null = null;
let agentId: string | null = null;
let agentReady = false;
let agentInitError: string | null = null;

export interface VoiceSessionStart {
  conversationToken: string;
  overrides: {
    agent: {
      prompt: { prompt: string };
      firstMessage: string;
    };
  };
}

export function isInterviewAgentReady(): boolean {
  return agentReady;
}

export function interviewAgentStatus(): { ready: boolean; agentId: string | null; error: string | null } {
  return { ready: agentReady, agentId, error: agentInitError };
}

function openingMessage(candidateName: string, title: string): string {
  return `Hello ${candidateName}, thank you for joining. I'll be conducting your mock interview for ${title}. When you're ready, tell me a bit about your background for this role.`;
}

function isElevenLabsNotFoundError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    message.includes('document_not_found') ||
    message.includes('not_found') ||
    message.includes('status code 404') ||
    message.includes('statusCode":404')
  );
}

async function createInterviewAgent(client: ElevenLabsClient): Promise<string> {
  const created = await client.conversationalAi.agents.create({
    name: 'Job Search OS — Interview Practice',
    conversationConfig: {
      agent: {
        firstMessage: 'Hello, thanks for joining your mock interview.',
        prompt: {
          prompt: 'You are a professional job interviewer. Ask one question at a time.',
          llm: interviewPracticeEnv.elevenLabsAgentLlm,
          temperature: 0.6,
          maxTokens: 500,
        },
        language: 'en',
      },
      tts: { modelId: 'eleven_turbo_v2' },
    },
    platformSettings: {
      overrides: {
        conversationConfigOverride: {
          agent: {
            firstMessage: true,
            prompt: { prompt: true },
          },
        },
      },
      privacy: { recordVoice: false },
    },
  });
  const id = created.agentId;
  logger.info(
    { agentId: id },
    'Created ElevenLabs interview agent — set ELEVENLABS_INTERVIEW_AGENT_ID in .env',
  );
  return id;
}

async function applyInterviewAgentSettings(client: ElevenLabsClient, id: string): Promise<void> {
  try {
    await client.conversationalAi.agents.update(id, {
      conversationConfig: {
        conversation: { maxDurationSeconds: 3600 },
        agent: {
          prompt: {
            llm: interviewPracticeEnv.elevenLabsAgentLlm,
            temperature: 0.6,
            maxTokens: 1024,
          },
        },
        turn: { turnEagerness: 'patient' },
      },
    });
  } catch (err) {
    if (isElevenLabsNotFoundError(err)) throw err;
    logger.warn({ err, agentId: id }, 'Could not update interview agent settings');
  }
}

async function resolveInterviewAgentId(
  client: ElevenLabsClient,
  configuredId: string,
): Promise<string> {
  if (configuredId) {
    try {
      await client.conversationalAi.agents.get(configuredId);
      return configuredId;
    } catch (err) {
      if (!isElevenLabsNotFoundError(err)) throw err;
      logger.warn(
        { configuredId },
        'Configured ELEVENLABS_INTERVIEW_AGENT_ID not found for this API key — creating a new agent',
      );
    }
  }
  return createInterviewAgent(client);
}

export async function initInterviewAgent(): Promise<void> {
  const apiKey = interviewPracticeEnv.elevenLabsApiKey;
  if (!apiKey) {
    agentInitError = 'ELEVENLABS_API_KEY is not configured';
    logger.warn(agentInitError);
    return;
  }

  elevenLabs = new ElevenLabsClient({ apiKey });
  agentReady = false;

  try {
    const id = await resolveInterviewAgentId(elevenLabs, interviewPracticeEnv.interviewAgentId);
    agentId = id;
    await applyInterviewAgentSettings(elevenLabs, id);
    agentReady = true;
    agentInitError = null;
    logger.info({ agentId: id }, 'ElevenLabs interview agent ready');
  } catch (err) {
    agentId = null;
    agentReady = false;
    agentInitError = err instanceof Error ? err.message : 'Interview agent init failed';
    logger.error({ err }, agentInitError);
  }
}

export async function issueAgentVoiceSession(
  session: InterviewSessionRow,
  candidateName: string,
): Promise<VoiceSessionStart> {
  if (!agentReady || !elevenLabs || !agentId) {
    throw new Error(agentInitError ?? 'Voice interviewer is not configured on the server');
  }

  await markSessionStarted(session.id);

  const systemPrompt = buildVoiceInterviewerSystemPrompt({
    candidateName,
    title: session.title,
    jobDescription: session.job_description,
    resumeText: session.resume_text,
    focusNotes: session.focus_notes,
    interviewType: session.interview_type,
    difficulty: session.difficulty,
    durationMinutes: session.duration_minutes,
    rollingSummary: session.rolling_summary,
  });

  const firstMessage = openingMessage(candidateName, session.title);
  // Only override fields enabled on the agent (prompt + firstMessage). maxTokens belongs on agent config only.
  const overrides = {
    agent: {
      prompt: { prompt: systemPrompt },
      firstMessage,
    },
  };

  const response = await requestWebrtcToken(elevenLabs, agentId, session.id);

  const conversationToken = response.token;
  if (!conversationToken) throw new Error('ElevenLabs did not return a conversation token');

  return { conversationToken, overrides };
}

async function requestWebrtcToken(
  client: ElevenLabsClient,
  currentAgentId: string,
  participantName: string,
) {
  try {
    return await client.conversationalAi.conversations.getWebrtcToken({
      agentId: currentAgentId,
      participantName,
    });
  } catch (err) {
    if (!isElevenLabsNotFoundError(err) || !elevenLabs) throw err;

    logger.warn({ agentId: currentAgentId }, 'Interview agent missing during token request — recreating');
    const newId = await createInterviewAgent(elevenLabs);
    agentId = newId;
    await applyInterviewAgentSettings(elevenLabs, newId);
    agentReady = true;
    agentInitError = null;
    logger.info({ agentId: newId }, 'Recreated ElevenLabs interview agent — update ELEVENLABS_INTERVIEW_AGENT_ID in .env');

    return client.conversationalAi.conversations.getWebrtcToken({
      agentId: newId,
      participantName,
    });
  }
}

export async function syncElevenLabsTranscript(
  conversationId: string,
  sessionId: string,
): Promise<number> {
  if (!elevenLabs) return 0;

  const existing = await getSessionMessages(sessionId);
  if (existing.length > 0) return existing.length;

  const delays = [0, 2000, 4000, 6000, 8000];
  let transcript: Awaited<ReturnType<typeof elevenLabs.conversationalAi.conversations.get>>['transcript'] =
    [];

  for (const delayMs of delays) {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    try {
      const conversation = await elevenLabs.conversationalAi.conversations.get(conversationId);
      transcript = conversation.transcript ?? [];
      if (transcript.length > 0) break;
    } catch (err) {
      logger.warn({ err, conversationId, delayMs }, 'Transcript fetch retry');
    }
  }

  let saved = 0;
  for (const turn of transcript) {
    const text = (turn.message ?? turn.originalMessage ?? '').trim();
    if (!text) continue;

    const role = turn.role === 'user' ? 'candidate' : turn.role === 'agent' ? 'ai' : null;
    if (!role) continue;

    await appendInterviewMessage(sessionId, role, text);
    saved += 1;
  }

  return saved;
}
