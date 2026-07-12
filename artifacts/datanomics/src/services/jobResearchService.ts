import { supabase } from '@/lib/supabase';
import { candidateNameFromJoin } from '@/lib/candidateDisplayName';
import { ARCHIVED_JOB_RECOMMENDATION_STATUSES } from '@/lib/jobRecommendationStatus';

async function staffAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export type JobResearchRunStatus = 'running' | 'success' | 'failed';
export type JobRecommendationStatus =
  | 'ai_fetched'
  | 'applied'
  | 'not_applied'
  | 'outdated'
  | 'other_recommended';
export type JobApplyType = 'direct' | 'easy' | 'unknown';

export interface JobResearchRun {
  id: string;
  candidate_id: string;
  status: JobResearchRunStatus;
  trigger_source: string;
  queries_used: string[];
  results_found: number;
  results_saved: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_by: string | null;
}

export interface JobRecommendation {
  id: string;
  candidate_id: string;
  run_id: string | null;
  title: string;
  company: string;
  location: string | null;
  work_mode: string | null;
  job_url: string | null;
  apply_type: JobApplyType;
  source_label: string | null;
  match_score: number | null;
  rationale: string | null;
  snippet: string | null;
  status: JobRecommendationStatus;
  status_updated_at: string | null;
  status_updated_by: string | null;
  searched_at: string;
  created_at: string;
  candidates?: { full_name: string } | { full_name: string }[] | null;
}

const API_BASE = '/api';

export const jobResearchService = {
  async startRun(candidateId: string): Promise<{ runId: string; status: string }> {
    const res = await fetch(`${API_BASE}/job-research/run`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
      body: JSON.stringify({ candidateId }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? body.detail ?? 'Failed to start research');
    return body;
  },

  async getRunStatus(runId: string): Promise<JobResearchRun> {
    const res = await fetch(`${API_BASE}/job-research/status/${runId}`, {
      headers: await staffAuthHeaders(),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Status check failed');
    return body;
  },

  async setAutoResearchEnabled(candidateId: string, enabled: boolean) {
    const res = await fetch(`${API_BASE}/job-research/candidates/${candidateId}/enabled`, {
      method: 'PATCH',
      headers: await staffAuthHeaders(),
      body: JSON.stringify({ enabled }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Update failed');
    return body as { id: string; job_research_enabled: boolean; last_job_research_at: string | null };
  },

  async getRecommendationsForCandidate(candidateId: string, limit = 50): Promise<JobRecommendation[]> {
    let q = supabase
      .from('job_recommendations')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('match_score', { ascending: false, nullsFirst: false })
      .order('searched_at', { ascending: false })
      .limit(limit);

    for (const archived of ARCHIVED_JOB_RECOMMENDATION_STATUSES) {
      q = q.neq('status', archived);
    }

    const { data, error } = await q;
    if (error) throw error;
    return data as JobRecommendation[];
  },

  async getAllRecommendations(filters?: {
    status?: JobRecommendationStatus;
    applyType?: JobApplyType;
    limit?: number;
  }): Promise<JobRecommendation[]> {
    let q = supabase
      .from('job_recommendations')
      .select('*, candidates(full_name)')
      .order('searched_at', { ascending: false });

    if (filters?.status) {
      q = q.eq('status', filters.status);
    } else {
      for (const archived of ARCHIVED_JOB_RECOMMENDATION_STATUSES) {
        q = q.neq('status', archived);
      }
    }

    if (filters?.applyType) q = q.eq('apply_type', filters.applyType);
    if (filters?.limit) q = q.limit(filters.limit);

    const { data, error } = await q;
    if (error) throw error;
    return enrichRecommendationNames(data as JobRecommendation[]);
  },

  async getRecentRuns(candidateId: string, limit = 5): Promise<JobResearchRun[]> {
    const { data, error } = await supabase
      .from('job_research_runs')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data as JobResearchRun[];
  },

  async updateRecommendationStatus(id: string, status: JobRecommendationStatus) {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id ?? null;

    const { data, error } = await supabase
      .from('job_recommendations')
      .update({
        status,
        status_updated_at: new Date().toISOString(),
        status_updated_by: userId,
      })
      .eq('id', id)
      .select('*, candidates(full_name)')
      .single();
    if (error) throw error;
    const [enriched] = await enrichRecommendationNames([data as JobRecommendation]);
    return enriched;
  },
};

async function enrichRecommendationNames(
  items: JobRecommendation[],
): Promise<JobRecommendation[]> {
  if (items.length === 0) return items;

  const missingIds = [
    ...new Set(
      items
        .filter((item) => !candidateNameFromJoin(item.candidates))
        .map((item) => item.candidate_id),
    ),
  ];

  let nameById = new Map<string, string>();
  if (missingIds.length > 0) {
    const { data: candidates, error } = await supabase
      .from('candidates')
      .select('id, full_name')
      .in('id', missingIds);
    if (error) throw error;

    nameById = new Map(
      (candidates ?? []).map((row) => [row.id as string, (row.full_name as string)?.trim() || '']),
    );
  }

  return items.map((item) => {
    const joined = candidateNameFromJoin(item.candidates);
    if (joined) {
      return { ...item, candidates: { full_name: joined } };
    }
    const fullName = nameById.get(item.candidate_id);
    return fullName
      ? { ...item, candidates: { full_name: fullName } }
      : item;
  });
}
