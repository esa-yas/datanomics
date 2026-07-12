import { getSupabaseAdmin } from '../supabaseAdmin';
import { gmailEnv } from '../env';
import { logger } from '../logger';
import { syncCandidateGmail } from './sync';

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function runAutoSync(): Promise<void> {
  if (running) {
    logger.debug('Gmail auto-sync skipped — previous run still in progress');
    return;
  }
  running = true;
  const started = Date.now();

  try {
    const supabase = getSupabaseAdmin();
    const { data: connections, error } = await supabase
      .from('google_connections')
      .select('candidate_id')
      .eq('status', 'connected');

    if (error) throw error;

    const ids = (connections ?? []).map((c) => c.candidate_id as string);
    if (ids.length === 0) {
      logger.debug('Gmail auto-sync: no connected candidates');
      return;
    }

    let ok = 0;
    let failed = 0;
    for (const candidateId of ids) {
      try {
        await syncCandidateGmail(supabase, candidateId);
        ok++;
      } catch (err) {
        failed++;
        logger.warn(
          { candidateId, err: err instanceof Error ? err.message : err },
          'Gmail auto-sync failed for candidate',
        );
      }
    }

    logger.info(
      { candidates: ids.length, ok, failed, ms: Date.now() - started },
      'Gmail auto-sync completed',
    );
  } catch (err) {
    logger.error({ err }, 'Gmail auto-sync batch failed');
  } finally {
    running = false;
  }
}

export function startGmailAutoSync(): void {
  if (timer) return;

  const minutes = gmailEnv.autoSyncIntervalMinutes;
  const intervalMs = minutes * 60_000;

  logger.info({ intervalMinutes: minutes }, 'Gmail auto-sync scheduler started');

  // Stagger first run so server is warm
  setTimeout(() => {
    void runAutoSync();
  }, 15_000);

  timer = setInterval(() => {
    void runAutoSync();
  }, intervalMs);
}
