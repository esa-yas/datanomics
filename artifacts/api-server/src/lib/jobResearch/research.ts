import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabaseAdmin';
import { logger } from '../logger';
import { chatJson } from './openai';
import { buildSearchQueries, normalizeTargetRoles, titleMatchesTargetRoles, webSearch, isEasyApplyUrl, type SearchHit } from './search';
import { jobResearchEnv } from './env';

/** Candidates in these statuses must not receive AI job search (manual or scheduled). */
export const JOB_RESEARCH_BLOCKED_STATUSES = ['placed'] as const;

const JOB_RESEARCH_AUTO_STATUSES = [
  'active_search',
  'application_started',
  'profile_setup',
  'lead',
] as const;

export function isJobResearchEligibleStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return !(JOB_RESEARCH_BLOCKED_STATUSES as readonly string[]).includes(status);
}

async function assertJobResearchEligible(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('candidates')
    .select('status, job_research_enabled')
    .eq('id', candidateId)
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Candidate not found');
  }

  if (!isJobResearchEligibleStatus(data.status as string)) {
    if (data.job_research_enabled) {
      await supabase
        .from('candidates')
        .update({ job_research_enabled: false })
        .eq('id', candidateId);
    }
    throw new Error('AI job search is not available for placed candidates');
  }
}

export interface CandidateResearchProfile {
  id: string;
  full_name: string;
  target_roles: string[];
  skills: string[];
  city?: string | null;
  state?: string | null;
  country?: string | null;
  preferred_work_modes: string[];
  work_auth?: string | null;
  experience_years?: number | null;
  resumeSnippet?: string;
}

interface RankedJob {
  title: string;
  company: string;
  location?: string;
  work_mode?: string;
  job_url: string;
  apply_type: 'direct' | 'easy' | 'unknown';
  match_score: number;
  rationale: string;
  source_label?: string;
  snippet?: string;
}

function dedupeKey(url: string): string {
  const normalized = url.toLowerCase().replace(/\/$/, '').split('?')[0].split('#')[0];
  return createHash('md5').update(normalized).digest('hex');
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.toString();
  } catch {
    return url.trim();
  }
}

function mergeHits(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    if (!h.url || !h.title) continue;
    const key = dedupeKey(h.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function loadCandidateProfile(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<CandidateResearchProfile> {
  const { data: candidate, error } = await supabase
    .from('candidates')
    .select(
      'id, full_name, target_roles, skills, city, state, country, preferred_work_modes, work_auth, experience_years',
    )
    .eq('id', candidateId)
    .single();

  if (error || !candidate) {
    throw new Error(error?.message ?? 'Candidate not found');
  }

  const { data: resume } = await supabase
    .from('resumes')
    .select('raw_text')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const snippet = (resume?.raw_text as string | undefined)?.slice(0, 2500) ?? '';

  return {
    id: candidate.id,
    full_name: candidate.full_name,
    target_roles: candidate.target_roles ?? [],
    skills: candidate.skills ?? [],
    city: candidate.city,
    state: candidate.state,
    country: candidate.country,
    preferred_work_modes: candidate.preferred_work_modes ?? [],
    work_auth: candidate.work_auth,
    experience_years: candidate.experience_years,
    resumeSnippet: snippet,
  };
}

const SENIORITY_RE = /^(senior|junior|lead|staff|principal|sr\.?|jr\.?)\s+/i;

function guessCompany(title: string, url: string): string {
  const atMatch = title.match(/\bat\s+([^|,\-–]+)/i);
  if (atMatch?.[1]) return atMatch[1].trim();

  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const parts = host.split('.');
    if (parts.length >= 2) {
      const label = parts[parts.length - 2];
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
  } catch {
    /* ignore */
  }

  return 'Unknown';
}

function heuristicMatchScore(title: string, targetRoles: string[], url: string): number {
  const titleLower = title.toLowerCase();
  let score = 45;

  for (const role of targetRoles) {
    const roleLower = role.toLowerCase().replace(SENIORITY_RE, '').trim();
    if (!roleLower) continue;
    if (titleLower.includes(roleLower)) {
      score = Math.max(score, 88);
      continue;
    }
    const words = roleLower.split(/\s+/).filter((w) => w.length > 3);
    const matched = words.filter((w) => titleLower.includes(w)).length;
    if (matched >= Math.min(2, words.length)) {
      score = Math.max(score, 72);
    }
  }

  if (!isEasyApplyUrl(url)) score += 12;
  return Math.min(95, score);
}

function rankJobsHeuristic(
  profile: CandidateResearchProfile,
  hits: SearchHit[],
  maxResults: number,
): RankedJob[] {
  const targetRoles = normalizeTargetRoles(profile.target_roles);
  if (targetRoles.length === 0) return [];

  return hits
    .filter((hit) => titleMatchesTargetRoles(hit.title, targetRoles))
    .map((hit) => ({
      title: hit.title,
      company: guessCompany(hit.title, hit.url),
      location: [profile.city, profile.state].filter(Boolean).join(', ') || undefined,
      work_mode: profile.preferred_work_modes[0],
      job_url: normalizeUrl(hit.url),
      apply_type: isEasyApplyUrl(hit.url) ? ('easy' as const) : ('direct' as const),
      match_score: heuristicMatchScore(hit.title, targetRoles, hit.url),
      rationale:
        'Matched target role from web search (AI ranking unavailable — using keyword scoring).',
      source_label: hit.source,
      snippet: hit.snippet,
    }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, maxResults);
}

async function rankJobsWithAi(
  profile: CandidateResearchProfile,
  hits: SearchHit[],
  maxResults: number,
): Promise<RankedJob[]> {
  if (hits.length === 0) return [];

  const targetRoles = normalizeTargetRoles(profile.target_roles);
  if (targetRoles.length === 0) return [];

  const listing = hits
    .slice(0, 60)
    .map((h, i) => `[${i + 1}] ${h.title}\nURL: ${h.url}\n${h.snippet.slice(0, 280)}`)
    .join('\n\n');

  const roleList = targetRoles.map((r) => `- ${r}`).join('\n');

  const system = `You are a job search researcher for staffing teams. Given candidate target job titles and web search hits, pick matching job openings.

STRICT RULES:
- ONLY recommend jobs whose posting title matches one of the candidate's target roles below (or a very close synonym at the same seniority).
- Do NOT recommend unrelated titles, different functions, or roles inferred from skills/resume only.
- If a search hit is not for one of these roles, skip it entirely.
- Prioritize DIRECT company career pages (Greenhouse, Lever, Ashby, Workday, company /careers) over aggregator easy-apply boards.
- Exclude LinkedIn Easy Apply, Dice, Indeed quick apply unless no better option exists.

Target roles (only search for these):
${roleList}

Return JSON: { "jobs": [ { "title", "company", "location", "work_mode", "job_url", "apply_type": "direct"|"easy"|"unknown", "match_score": 0-100, "rationale", "source_label" } ] }
Include only real job postings from the search hits. Use exact URLs from hits. Return up to ${maxResults} jobs sorted by match_score descending.`;

  const user = `Candidate: ${profile.full_name}
Target roles ONLY: ${targetRoles.join(' | ')}
Location preference: ${[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}
Work modes: ${profile.preferred_work_modes.join(', ') || 'any'}
Work auth: ${profile.work_auth ?? 'unknown'}
Experience: ${profile.experience_years ?? '?'} years

Search results:
${listing}`;

  const parsed = await chatJson<{ jobs?: RankedJob[] }>(system, user);
  const jobs = (parsed.jobs ?? [])
    .filter((j) => j.title && j.job_url)
    .filter((j) => titleMatchesTargetRoles(j.title, targetRoles))
    .map((j) => ({
      ...j,
      job_url: normalizeUrl(j.job_url),
      apply_type: j.apply_type ?? 'unknown',
      match_score: Math.min(100, Math.max(0, Number(j.match_score) || 50)),
    }))
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, maxResults);

  return jobs;
}

async function rankJobs(
  profile: CandidateResearchProfile,
  hits: SearchHit[],
  maxResults: number,
): Promise<RankedJob[]> {
  try {
    const ranked = await rankJobsWithAi(profile, hits, maxResults);
    if (ranked.length > 0) return ranked;
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'AI job ranking failed — using heuristic fallback',
    );
  }

  return rankJobsHeuristic(profile, hits, maxResults);
}

export async function createResearchRun(
  candidateId: string,
  triggerSource: string,
  createdBy?: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  await assertJobResearchEligible(supabase, candidateId);

  const { data, error } = await supabase
    .from('job_research_runs')
    .insert({
      candidate_id: candidateId,
      status: 'running',
      trigger_source: triggerSource,
      created_by: createdBy ?? null,
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Could not create research run');
  return data.id as string;
}

export async function researchCandidateJobs(
  runId: string,
  candidateId: string,
): Promise<{ saved: number; found: number }> {
  const supabase = getSupabaseAdmin();
  const maxResults = jobResearchEnv.maxResultsPerRun;

  try {
    const profile = await loadCandidateProfile(supabase, candidateId);
    const queries = buildSearchQueries(profile);

    const perQuery = Math.ceil(maxResults / queries.length) + 4;
    const hitBatches = await Promise.all(
      queries.map((q) => webSearch(q, perQuery).catch((err) => {
        logger.warn({ query: q, err: err instanceof Error ? err.message : err }, 'Search query failed');
        return [] as SearchHit[];
      })),
    );

    const hits = mergeHits(hitBatches.flat());
    const ranked = await rankJobs(profile, hits, maxResults);

    const rows = ranked.map((job) => {
      const hit = hits.find((h) => dedupeKey(h.url) === dedupeKey(job.job_url));
      return {
        candidate_id: candidateId,
        run_id: runId,
        title: job.title,
        company: job.company || 'Unknown',
        location: job.location ?? null,
        work_mode: job.work_mode ?? null,
        job_url: job.job_url,
        apply_type: job.apply_type,
        source_label: job.source_label ?? hit?.source ?? null,
        match_score: job.match_score,
        rationale: job.rationale,
        snippet: hit?.snippet?.slice(0, 500) ?? null,
        status: 'ai_fetched' as const,
        dedupe_key: dedupeKey(job.job_url),
        searched_at: new Date().toISOString(),
      };
    });

    let saved = 0;
    if (rows.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from('job_recommendations')
        .upsert(rows, { onConflict: 'candidate_id,dedupe_key', ignoreDuplicates: true })
        .select('id');

      if (upsertError) throw upsertError;
      saved = upserted?.length ?? rows.length;
    }

    await supabase
      .from('job_research_runs')
      .update({
        status: 'success',
        queries_used: queries,
        results_found: hits.length,
        results_saved: saved,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    await supabase
      .from('candidates')
      .update({ last_job_research_at: new Date().toISOString() })
      .eq('id', candidateId);

    return { saved, found: hits.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Research failed';
    await supabase
      .from('job_research_runs')
      .update({
        status: 'failed',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);
    throw err;
  }
}

const activeStatuses = [...JOB_RESEARCH_AUTO_STATUSES];

export async function listCandidatesForAutoResearch(): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const intervalHours = jobResearchEnv.autoResearchIntervalHours;
  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('candidates')
    .select('id, last_job_research_at, status, job_research_enabled')
    .eq('job_research_enabled', true)
    .in('status', activeStatuses);

  if (error) throw error;

  return (data ?? [])
    .filter((c) => !c.last_job_research_at || c.last_job_research_at < cutoff)
    .map((c) => c.id as string);
}
