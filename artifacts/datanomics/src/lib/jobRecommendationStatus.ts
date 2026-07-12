import type { JobRecommendationStatus } from '@/services/jobResearchService';

export const JOB_RECOMMENDATION_STATUSES: JobRecommendationStatus[] = [
  'ai_fetched',
  'applied',
  'not_applied',
  'outdated',
  'other_recommended',
];

export const JOB_RECOMMENDATION_STATUS_LABELS: Record<JobRecommendationStatus, string> = {
  ai_fetched: 'AI fetched',
  applied: 'Applied',
  not_applied: 'Not applied',
  outdated: 'Outdated',
  other_recommended: 'Other recommended',
};

export const JOB_RECOMMENDATION_STATUS_CLASS: Record<JobRecommendationStatus, string> = {
  ai_fetched: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
  applied: 'bg-green-500/20 text-green-300 border-green-500/30',
  not_applied: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  outdated: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  other_recommended: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

/** Hidden from the default active list unless staff filter for them. */
export const ARCHIVED_JOB_RECOMMENDATION_STATUSES: JobRecommendationStatus[] = ['outdated'];
