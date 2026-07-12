import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  jobResearchService,
  type JobRecommendation,
  type JobResearchRun,
} from '@/services/jobResearchService';
import { applicationService } from '@/services/applicationService';
import {
  Search,
  Loader2,
  ExternalLink,
  Sparkles,
  Briefcase,
  Clock,
  AlertCircle,
  Ban,
} from 'lucide-react';
import type { CandidateStatus } from '@/types';
import { isJobResearchEligible } from '@/lib/jobResearchEligibility';
import { ARCHIVED_JOB_RECOMMENDATION_STATUSES } from '@/lib/jobRecommendationStatus';
import { JobRecommendationStatusSelect } from '@/components/candidate/JobRecommendationStatusSelect';
import type { JobRecommendationStatus } from '@/services/jobResearchService';

const POLL_MS = 3000;

const APPLY_TYPE_LABEL: Record<string, string> = {
  direct: 'Direct apply',
  easy: 'Easy apply',
  unknown: 'Unknown',
};

const APPLY_TYPE_CLASS: Record<string, string> = {
  direct: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  easy: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  unknown: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

interface Props {
  candidateId: string;
  candidateName: string;
  targetRoles: string[];
  candidateStatus?: CandidateStatus;
  autoEnabled?: boolean;
  lastResearchAt?: string | null;
  onAutoToggle?: (enabled: boolean) => void;
}

function displayTargetRoles(raw: string[]): string[] {
  const out: string[] = [];
  for (const entry of raw) {
    for (const part of entry.split(/\s*\|\s*|\s*\/\s*|,\s*/)) {
      const t = part.trim();
      if (t.length >= 4) out.push(t);
    }
  }
  return [...new Set(out)].slice(0, 8);
}

export function JobResearchCard({
  candidateId,
  candidateName,
  targetRoles,
  candidateStatus,
  autoEnabled = true,
  lastResearchAt,
  onAutoToggle,
}: Props) {
  const researchAllowed = isJobResearchEligible(candidateStatus);
  const [recommendations, setRecommendations] = useState<JobRecommendation[]>([]);
  const [runs, setRuns] = useState<JobResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [dailyEnabled, setDailyEnabled] = useState(autoEnabled);

  const loadData = useCallback(async () => {
    try {
      const [recs, recentRuns] = await Promise.all([
        jobResearchService.getRecommendationsForCandidate(candidateId),
        jobResearchService.getRecentRuns(candidateId),
      ]);
      setRecommendations(recs);
      setRuns(recentRuns);
      const latest = recentRuns[0];
      if (latest?.status === 'running') {
        setRunning(true);
        setActiveRunId(latest.id);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load job research');
    } finally {
      setLoading(false);
    }
  }, [candidateId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setDailyEnabled(autoEnabled);
  }, [autoEnabled]);

  useEffect(() => {
    if (!running || !activeRunId) return;

    const interval = setInterval(async () => {
      try {
        const run = await jobResearchService.getRunStatus(activeRunId);
        if (run.status !== 'running') {
          setRunning(false);
          setActiveRunId(null);
          if (run.status === 'success') {
            toast.success(`Found ${run.results_saved} job recommendation${run.results_saved === 1 ? '' : 's'}`);
          } else {
            toast.error(run.error_message ?? 'Job research failed');
          }
          void loadData();
        }
      } catch {
        /* keep polling */
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [running, activeRunId, loadData]);

  const handleRunResearch = async () => {
    if (!researchAllowed) {
      toast.error('AI job search is off for placed candidates');
      return;
    }
    try {
      setRunning(true);
      const { runId } = await jobResearchService.startRun(candidateId);
      setActiveRunId(runId);
      toast.success(`AI is searching jobs for ${candidateName}…`);
    } catch (err) {
      setRunning(false);
      toast.error(err instanceof Error ? err.message : 'Could not start research');
    }
  };

  const handleToggleDaily = async (checked: boolean) => {
    if (!researchAllowed) return;
    try {
      await jobResearchService.setAutoResearchEnabled(candidateId, checked);
      setDailyEnabled(checked);
      onAutoToggle?.(checked);
      toast.success(checked ? 'Daily AI job search enabled' : 'Daily AI job search paused');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleStatusChange = async (id: string, status: JobRecommendationStatus) => {
    try {
      const updated = await jobResearchService.updateRecommendationStatus(id, status);
      if (ARCHIVED_JOB_RECOMMENDATION_STATUSES.includes(status)) {
        setRecommendations((prev) => prev.filter((r) => r.id !== id));
      } else {
        setRecommendations((prev) => prev.map((r) => (r.id === id ? updated : r)));
      }
      toast.success('Status updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const handleSaveAsApplication = async (rec: JobRecommendation) => {
    try {
      await applicationService.create({
        candidate_id: candidateId,
        candidate_name: candidateName,
        company: rec.company,
        job_title: rec.title,
        job_url: rec.job_url ?? undefined,
        work_mode: (rec.work_mode as 'remote' | 'hybrid' | 'onsite' | undefined) ?? undefined,
        job_source: 'other',
        status: 'applied',
        notes: rec.rationale ?? undefined,
      });
      await jobResearchService.updateRecommendationStatus(rec.id, 'applied');
      setRecommendations((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, status: 'applied' } : r)),
      );
      toast.success('Saved as application');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const latestRun = runs[0];
  const directCount = recommendations.filter((r) => r.apply_type === 'direct').length;
  const rolesForSearch = displayTargetRoles(targetRoles);
  const canSearch = rolesForSearch.length > 0 && researchAllowed;

  return (
    <div className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5">
      {!researchAllowed && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/25 text-sm text-green-200">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" />
          This candidate is <span className="font-semibold mx-1">placed</span>. AI job search and daily
          auto-search are turned off. Past recommendations remain below for reference.
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-display font-bold text-lg">AI Job Research</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Searches only for jobs matching this candidate&apos;s target roles (direct company career pages).
            </p>
            {rolesForSearch.length > 0 ? (
              <p className="text-xs text-muted-foreground mt-2">
                Searching for: {rolesForSearch.join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-amber-400 mt-2">
                Add target roles on the candidate profile before running job research.
              </p>
            )}
          </div>
        </div>
        <Button onClick={handleRunResearch} disabled={running || !canSearch} className="shrink-0">
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Searching…
            </>
          ) : (
            <>
              <Search className="w-4 h-4 mr-2" />
              Search jobs now
            </>
          )}
        </Button>
      </div>

      {running && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            AI is searching job boards and career sites — this can take 1–3 minutes…
          </div>
          <Progress value={undefined} className="h-1.5 animate-pulse" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-6 text-sm">
        {researchAllowed && (
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={dailyEnabled}
              onCheckedChange={(v) => void handleToggleDaily(Boolean(v))}
            />
            <span>Daily auto-search</span>
          </label>
        )}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          Last run: {lastResearchAt ? new Date(lastResearchAt).toLocaleString() : 'Never'}
        </div>
        {recommendations.length > 0 && (
          <div className="text-muted-foreground">
            {recommendations.length} active · {directCount} direct apply
          </div>
        )}
      </div>

      {latestRun?.status === 'failed' && latestRun.error_message && !running && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {latestRun.error_message}
        </div>
      )}

      {loading ? (
        <div className="h-32 bg-muted/30 animate-pulse rounded-lg" />
      ) : recommendations.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-lg">
          No recommendations yet. Run a search to find 10–50 matching jobs.
        </div>
      ) : (
        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {recommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-4 rounded-lg border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground truncate">{rec.title}</span>
                    {rec.match_score != null && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                        {rec.match_score}% match
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${APPLY_TYPE_CLASS[rec.apply_type] ?? APPLY_TYPE_CLASS.unknown}`}
                    >
                      {APPLY_TYPE_LABEL[rec.apply_type] ?? rec.apply_type}
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {rec.company}
                    {rec.location ? ` · ${rec.location}` : ''}
                    {rec.work_mode ? ` · ${rec.work_mode}` : ''}
                  </div>
                  {rec.rationale && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{rec.rationale}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <JobRecommendationStatusSelect
                    value={rec.status}
                    onChange={(status) => void handleStatusChange(rec.id, status)}
                    compact
                  />
                  {rec.job_url && (
                    <a
                      href={rec.job_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {rec.status !== 'applied' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleSaveAsApplication(rec)}
                    >
                      <Briefcase className="w-3 h-3 mr-1" />
                      Log apply
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
