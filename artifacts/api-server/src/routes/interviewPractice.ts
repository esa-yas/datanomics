import { Router, type IRouter, type Request, type Response } from 'express';
import { requireStaffAuth, type AuthedRequest } from '../middleware/auth';
import { generateInterviewToken, hashInterviewToken } from '../lib/interviewPractice/crypto';
import { interviewPracticeEnv } from '../lib/interviewPractice/env';
import {
  issueAgentVoiceSession,
  isInterviewAgentReady,
  interviewAgentStatus,
  syncElevenLabsTranscript,
} from '../lib/interviewPractice/elevenLabsAgent';
import {
  createInterviewSession,
  finishSessionEarly,
  getSessionMessages,
  getSessionResult,
  interviewLinkUrl,
  listSessionsForCandidate,
  resolveSessionByToken,
  revokeSession,
} from '../lib/interviewPractice/sessions';

const router: IRouter = Router();

function noStoreJson(res: Response): void {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
}

const VALID_TYPES = new Set(['recruiter_screen', 'behavioral', 'technical', 'final_round']);
const VALID_DIFFICULTY = new Set(['easy', 'medium', 'hard']);
const VALID_DURATIONS = new Set([15, 30, 45, 60]);

/** POST /api/interview-practice/sessions — staff creates session + link */
router.post('/interview-practice/sessions', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const supabase = req.userSupabase;
    if (!supabase) {
      res.status(500).json({ error: 'Auth context missing' });
      return;
    }

    const body = req.body as Record<string, unknown>;
    const candidateId = String(body.candidateId ?? '').trim();
    const title = String(body.title ?? '').trim();
    const jobDescription = String(body.jobDescription ?? '').trim();
    const resumeText = String(body.resumeText ?? '').trim();
    const focusNotes = String(body.focusNotes ?? '').trim();
    const interviewType = String(body.interviewType ?? 'behavioral');
    const difficulty = String(body.difficulty ?? 'medium');
    const durationMinutes = Number(body.durationMinutes ?? 30);
    const expiresAtRaw = body.expiresAt ? String(body.expiresAt) : '';

    if (!candidateId || !title) {
      res.status(400).json({ error: 'candidateId and title are required' });
      return;
    }
    if (!VALID_TYPES.has(interviewType)) {
      res.status(400).json({ error: 'Invalid interviewType' });
      return;
    }
    if (!VALID_DIFFICULTY.has(difficulty)) {
      res.status(400).json({ error: 'Invalid difficulty' });
      return;
    }
    if (!VALID_DURATIONS.has(durationMinutes)) {
      res.status(400).json({ error: 'durationMinutes must be 15, 30, 45, or 60' });
      return;
    }

    const expiresAt = expiresAtRaw
      ? new Date(expiresAtRaw).toISOString()
      : new Date(
          Date.now() + interviewPracticeEnv.defaultLinkTtlDays * 24 * 3600_000,
        ).toISOString();

    const token = generateInterviewToken();
    const tokenHash = hashInterviewToken(token);

    const session = await createInterviewSession(supabase, {
      candidateId,
      createdBy: req.userId!,
      title,
      jobDescription,
      resumeText,
      focusNotes,
      interviewType,
      difficulty,
      durationMinutes,
      expiresAt,
      tokenHash,
    });

    res.json({
      session,
      url: interviewLinkUrl(token),
      expiresAt,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create session' });
  }
});

/** GET /api/interview-practice/candidates/:candidateId/sessions */
router.get(
  '/interview-practice/candidates/:candidateId/sessions',
  requireStaffAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const supabase = req.userSupabase;
      if (!supabase) {
        res.status(500).json({ error: 'Auth context missing' });
        return;
      }
      const sessions = await listSessionsForCandidate(supabase, req.params.candidateId);
      const withResults = await Promise.all(
        sessions.map(async (s) => ({
          ...s,
          secure_token_hash: undefined,
          result: await getSessionResult(s.id),
        })),
      );
      res.json(withResults);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list sessions' });
    }
  },
);

/** POST /api/interview-practice/sessions/:id/revoke */
router.post(
  '/interview-practice/sessions/:id/revoke',
  requireStaffAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const supabase = req.userSupabase;
      if (!supabase) {
        res.status(500).json({ error: 'Auth context missing' });
        return;
      }
      await revokeSession(supabase, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Revoke failed' });
    }
  },
);

/** GET /api/interview-practice/public/:token — validate link (no auth) */
router.get('/interview-practice/public/:token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? '');
    const resolved = await resolveSessionByToken(token);
    if (!resolved) {
      res.status(404).json({ error: 'Invalid interview link' });
      return;
    }
    if ('invalid' in resolved) {
      res.status(410).json({ error: `Link ${resolved.reason}` });
      return;
    }

    const { session, candidateName } = resolved;
    noStoreJson(res);
    res.json({
      candidateName,
      title: session.title,
      durationMinutes: session.duration_minutes,
      interviewType: session.interview_type,
      difficulty: session.difficulty,
      status: session.status,
      expiresAt: session.expires_at,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Validation failed' });
  }
});

/** GET /api/interview-practice/public/:token/result — feedback for candidate */
router.get('/interview-practice/public/:token/result', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? '');
    const resolved = await resolveSessionByToken(token);
    if (!resolved || 'invalid' in resolved) {
      res.status(404).json({ error: 'Interview not found' });
      return;
    }

    const { session } = resolved;
    if (session.status !== 'completed') {
      res.status(409).json({ error: 'Interview not completed yet', status: session.status });
      return;
    }

    const [result, messages] = await Promise.all([
      getSessionResult(session.id),
      getSessionMessages(session.id),
    ]);

    noStoreJson(res);
    res.json({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        completedAt: session.completed_at,
        durationMinutes: session.duration_minutes,
      },
      result,
      messages,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load result' });
  }
});

/** GET /api/interview-practice/public/:token/voice-token — WebRTC token for ElevenLabs hosted agent */
router.get('/interview-practice/public/:token/voice-token', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? '');
    const resolved = await resolveSessionByToken(token, { forLive: true });
    if (!resolved) {
      res.status(404).json({ error: 'Invalid interview link' });
      return;
    }
    if ('invalid' in resolved) {
      res.status(410).json({ error: `Link ${resolved.reason}` });
      return;
    }

    if (!isInterviewAgentReady()) {
      const status = interviewAgentStatus();
      res.status(503).json({
        error: status.error ?? 'Voice interviewer is not configured. Set ELEVENLABS_API_KEY on the server.',
      });
      return;
    }

    const { session, candidateName } = resolved;
    const voiceSession = await issueAgentVoiceSession(session, candidateName);
    noStoreJson(res);
    res.json(voiceSession);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start voice session' });
  }
});

/** POST /api/interview-practice/public/:token/finish — end interview and generate report */
router.post('/interview-practice/public/:token/finish', async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? '');
    const conversationId = String((req.body as { conversationId?: string })?.conversationId ?? '').trim();
    const resolved = await resolveSessionByToken(token);
    if (!resolved || 'invalid' in resolved) {
      res.status(404).json({ error: 'Interview not found' });
      return;
    }

    const { session } = resolved;
    if (session.status === 'completed') {
      const result = await getSessionResult(session.id);
      noStoreJson(res);
      res.json({ ok: true, status: 'completed', result });
      return;
    }

    if (conversationId) {
      try {
        await syncElevenLabsTranscript(conversationId, session.id);
      } catch (err) {
        console.warn('[interview] transcript sync failed', err);
      }
    }

    await finishSessionEarly(session);
    const result = await getSessionResult(session.id);
    noStoreJson(res);
    res.json({ ok: true, status: 'completed', result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to finish interview' });
  }
});

/** GET /api/interview-practice/sessions/:id/result — staff view */
router.get(
  '/interview-practice/sessions/:id/result',
  requireStaffAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const supabase = req.userSupabase;
      if (!supabase) {
        res.status(500).json({ error: 'Auth context missing' });
        return;
      }

      const { data: session, error } = await supabase
        .from('interview_sessions')
        .select('*')
        .eq('id', req.params.id)
        .single();
      if (error || !session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const [result, messages] = await Promise.all([
        getSessionResult(session.id as string),
        getSessionMessages(session.id as string),
      ]);

      res.json({ session, result, messages });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load result' });
    }
  },
);

export default router;
