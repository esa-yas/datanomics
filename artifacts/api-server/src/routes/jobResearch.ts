import { Router, type IRouter, type Request, type Response } from 'express';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { jobResearchEnv } from '../lib/jobResearch/env';
import {
  runResearchBatchNow,
  runResearchForCandidate,
  startResearchInBackground,
} from '../lib/jobResearch/autoResearch';
import { requireStaffAuth, type AuthedRequest } from '../middleware/auth';

const router: IRouter = Router();

/** POST /api/job-research/run — start AI web search for one candidate (async) */
router.post('/job-research/run', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const candidateId = String(req.body?.candidateId ?? '').trim();
    if (!candidateId) {
      res.status(400).json({ error: 'candidateId is required' });
      return;
    }

    if (!jobResearchEnv.tavilyApiKey && !jobResearchEnv.serperApiKey) {
      res.status(503).json({
        error: 'Search API not configured',
        detail: 'Set TAVILY_API_KEY or SERPER_API_KEY in .env',
      });
      return;
    }

    const runId = await startResearchInBackground(candidateId, 'manual', req.userId);
    res.json({ runId, status: 'running' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start research';
    const status = message.includes('already in progress')
      ? 409
      : message.includes('not available for placed')
        ? 403
        : 500;
    res.status(status).json({ error: message });
  }
});

/** GET /api/job-research/status/:runId */
router.get('/job-research/status/:runId', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('job_research_runs')
      .select('*')
      .eq('id', req.params.runId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
  }
});

/** POST /api/job-research/run-sync — block until complete (for scripts) */
router.post('/job-research/run-sync', requireStaffAuth, async (req: AuthedRequest, res: Response) => {
  try {
    const candidateId = String(req.body?.candidateId ?? '').trim();
    if (!candidateId) {
      res.status(400).json({ error: 'candidateId is required' });
      return;
    }

    const { runId } = await runResearchForCandidate(candidateId, 'manual_sync', req.userId);
    const supabase = getSupabaseAdmin();
    const { data: run } = await supabase
      .from('job_research_runs')
      .select('*')
      .eq('id', runId)
      .single();

    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Research failed' });
  }
});

/** POST /api/job-research/run-all — daily cron (x-cron-secret) */
router.post('/job-research/run-all', async (req: Request, res: Response) => {
  const secret = jobResearchEnv.cronSecret;
  if (!secret || req.headers['x-cron-secret'] !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await runResearchBatchNow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Batch research failed' });
  }
});

/** PATCH /api/job-research/candidates/:id/enabled */
router.patch(
  '/job-research/candidates/:id/enabled',
  requireStaffAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const enabled = Boolean(req.body?.enabled);
      const supabase = req.userSupabase!;

      if (enabled) {
        const { data: candidate, error: readError } = await supabase
          .from('candidates')
          .select('status')
          .eq('id', req.params.id)
          .single();
        if (readError) throw readError;
        if (candidate?.status === 'placed') {
          res.status(403).json({ error: 'Cannot enable AI job search for placed candidates' });
          return;
        }
      }

      const { data, error } = await supabase
        .from('candidates')
        .update({ job_research_enabled: enabled })
        .eq('id', req.params.id)
        .select('id, job_research_enabled, last_job_research_at')
        .single();

      if (error) throw error;
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Update failed' });
    }
  },
);

export default router;
