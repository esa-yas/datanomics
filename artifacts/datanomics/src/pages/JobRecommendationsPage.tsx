import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import toast from 'react-hot-toast';
import {
  jobResearchService,
  type JobRecommendation,
  type JobRecommendationStatus,
  type JobApplyType,
} from '@/services/jobResearchService';
import { useCandidatesPicklist } from '@/hooks/useData';
import { resolveCandidateDisplayName } from '@/lib/candidateDisplayName';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ExternalLink, Sparkles, RefreshCw } from 'lucide-react';
import { JobRecommendationStatusSelect } from '@/components/candidate/JobRecommendationStatusSelect';
import {
  JOB_RECOMMENDATION_STATUSES,
  JOB_RECOMMENDATION_STATUS_LABELS,
  ARCHIVED_JOB_RECOMMENDATION_STATUSES,
} from '@/lib/jobRecommendationStatus';

const STATUS_OPTIONS: { value: JobRecommendationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All active' },
  ...JOB_RECOMMENDATION_STATUSES.map((status) => ({
    value: status,
    label: JOB_RECOMMENDATION_STATUS_LABELS[status],
  })),
];

const APPLY_OPTIONS: { value: JobApplyType | 'all'; label: string }[] = [
  { value: 'all', label: 'All apply types' },
  { value: 'direct', label: 'Direct apply' },
  { value: 'easy', label: 'Easy apply' },
];

export default function JobRecommendationsPage() {
  const [items, setItems] = useState<JobRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<JobRecommendationStatus | 'all'>('all');
  const [applyFilter, setApplyFilter] = useState<JobApplyType | 'all'>('all');
  const { data: candidates = [] } = useCandidatesPicklist();

  const candidateNameById = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.id, candidate.full_name])),
    [candidates],
  );

  const displayCandidateName = (item: JobRecommendation) =>
    resolveCandidateDisplayName(item.candidate_id, item.candidates, candidateNameById, 'Unknown');

  const load = async () => {
    setLoading(true);
    try {
      const data = await jobResearchService.getAllRecommendations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        applyType: applyFilter === 'all' ? undefined : applyFilter,
        limit: 200,
      });
      setItems(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [statusFilter, applyFilter]);

  const handleStatusChange = async (id: string, status: JobRecommendationStatus) => {
    try {
      const updated = await jobResearchService.updateRecommendationStatus(id, status);
      if (ARCHIVED_JOB_RECOMMENDATION_STATUSES.includes(status) && statusFilter !== 'outdated') {
        setItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...updated,
                  candidates: updated.candidates ?? item.candidates,
                }
              : item,
          ),
        );
      }
      toast.success('Status updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  const directCount = items.filter((i) => i.apply_type === 'direct').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Job Recommendations
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jobs discovered by AI web search across all active candidates. {directCount} direct-apply listings shown.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={applyFilter} onValueChange={(v) => setApplyFilter(v as typeof applyFilter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APPLY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            No recommendations yet. Run AI job search from a candidate profile.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Candidate</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Company</th>
                  <th className="px-4 py-3 font-semibold">Match</th>
                  <th className="px-4 py-3 font-semibold">Apply</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Found</th>
                  <th className="px-4 py-3 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <Link
                        href={`/candidates/${item.candidate_id}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {displayCandidateName(item)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate">{item.title}</td>
                    <td className="px-4 py-3">{item.company}</td>
                    <td className="px-4 py-3">
                      {item.match_score != null ? `${item.match_score}%` : '—'}
                    </td>
                    <td className="px-4 py-3 capitalize">{item.apply_type}</td>
                    <td className="px-4 py-3">
                      <JobRecommendationStatusSelect
                        value={item.status}
                        onChange={(status) => void handleStatusChange(item.id, status)}
                        compact
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {new Date(item.searched_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {item.job_url && (
                        <a
                          href={item.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          Open <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
