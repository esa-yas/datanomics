import { logger } from '../logger';
import { jobResearchEnv } from './env';
import {
  createResearchRun,
  listCandidatesForAutoResearch,
  researchCandidateJobs,
} from './research';

const runningCandidates = new Set<string>();
let batchRunning = false;
let timer: ReturnType<typeof setInterval> | null = null;

export async function runResearchForCandidate(
  candidateId: string,
  triggerSource: string,
  createdBy?: string,
): Promise<{ runId: string }> {
  if (runningCandidates.has(candidateId)) {
    throw new Error('Research already in progress for this candidate');
  }

  runningCandidates.add(candidateId);
  const runId = await createResearchRun(candidateId, triggerSource, createdBy);

  try {
    await researchCandidateJobs(runId, candidateId);
    return { runId };
  } finally {
    runningCandidates.delete(candidateId);
  }
}

export function startResearchInBackground(
  candidateId: string,
  triggerSource: string,
  createdBy?: string,
): Promise<string> {
  return createResearchRun(candidateId, triggerSource, createdBy).then((runId) => {
    void (async () => {
      runningCandidates.add(candidateId);
      try {
        await researchCandidateJobs(runId, candidateId);
      } catch (err) {
        logger.error(
          { candidateId, runId, err: err instanceof Error ? err.message : err },
          'Background job research failed',
        );
      } finally {
        runningCandidates.delete(candidateId);
      }
    })();
    return runId;
  });
}

async function runDailyBatch(): Promise<void> {
  if (batchRunning) {
    logger.debug('Job research auto-batch skipped — previous run in progress');
    return;
  }

  if (!jobResearchEnv.tavilyApiKey && !jobResearchEnv.serperApiKey) {
    logger.debug('Job research auto-batch skipped — no search API key');
    return;
  }

  batchRunning = true;
  const started = Date.now();

  try {
    const candidateIds = await listCandidatesForAutoResearch();
    if (candidateIds.length === 0) {
      logger.debug('Job research auto-batch: no candidates due');
      return;
    }

    let ok = 0;
    let failed = 0;

    for (const candidateId of candidateIds) {
      if (runningCandidates.has(candidateId)) continue;
      try {
        const runId = await createResearchRun(candidateId, 'daily_auto');
        runningCandidates.add(candidateId);
        try {
          await researchCandidateJobs(runId, candidateId);
          ok++;
        } finally {
          runningCandidates.delete(candidateId);
        }
      } catch (err) {
        failed++;
        logger.warn(
          { candidateId, err: err instanceof Error ? err.message : err },
          'Daily job research failed for candidate',
        );
      }
    }

    logger.info(
      { candidates: candidateIds.length, ok, failed, ms: Date.now() - started },
      'Job research daily batch completed',
    );
  } catch (err) {
    logger.error({ err }, 'Job research daily batch failed');
  } finally {
    batchRunning = false;
  }
}

export async function runResearchBatchNow(): Promise<{
  candidates: number;
  ok: number;
  failed: number;
}> {
  const candidateIds = await listCandidatesForAutoResearch();
  let ok = 0;
  let failed = 0;

  for (const candidateId of candidateIds) {
    if (runningCandidates.has(candidateId)) {
      failed++;
      continue;
    }
    try {
      const runId = await createResearchRun(candidateId, 'cron');
      runningCandidates.add(candidateId);
      try {
        await researchCandidateJobs(runId, candidateId);
        ok++;
      } finally {
        runningCandidates.delete(candidateId);
      }
    } catch {
      failed++;
    }
  }

  return { candidates: candidateIds.length, ok, failed };
}

export function startJobResearchAutoScheduler(): void {
  if (timer) return;

  const hours = jobResearchEnv.autoResearchIntervalHours;
  const intervalMs = hours * 60 * 60 * 1000;

  logger.info({ intervalHours: hours }, 'Job research auto-scheduler started');

  setTimeout(() => {
    void runDailyBatch();
  }, 60_000);

  timer = setInterval(() => {
    void runDailyBatch();
  }, intervalMs);
}
