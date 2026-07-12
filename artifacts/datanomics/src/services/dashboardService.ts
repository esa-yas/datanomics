import { supabase } from '../lib/supabase';
import { candidateService } from './candidateService';
import type { Application } from '../types';

const APPLICATION_LIST =
  'id, candidate_id, candidate_name, company, job_title, status, quality_score, applied_at';

const ACTIVE_STATUSES = new Set([
  'lead',
  'profile_setup',
  'application_started',
  'active_search',
  'interview_stage',
  'offer_received',
]);

export interface DashboardData {
  stats: {
    totalCandidates: number;
    activeSearches: number;
    placed: number;
    totalApplications: number;
    appsThisWeek: number;
    appliedToday: number;
  };
  statusPipeline: { name: string; count: number }[];
  appsPerDay: { date: string; apps: number }[];
  sourceBreakdown: { name: string; count: number }[];
  topCandidates: { name: string; count: number }[];
  recentApps: Application[];
}

interface DailyCountRow {
  candidate_id: string;
  date: string;
  total_apply_count: number | null;
  linkedin_count: number | null;
  dice_count: number | null;
  other_count: number | null;
  candidates?: { full_name?: string | null } | { full_name?: string | null }[] | null;
}

function candidateName(row: DailyCountRow): string {
  const c = row.candidates;
  if (!c) return row.candidate_id.slice(0, 8);
  if (Array.isArray(c)) return c[0]?.full_name ?? row.candidate_id.slice(0, 8);
  return c.full_name ?? row.candidate_id.slice(0, 8);
}

function dayKey(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export async function fetchDashboard(): Promise<DashboardData> {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekStr = weekAgo.toISOString().slice(0, 10);

  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
  fourteenDaysAgo.setHours(0, 0, 0, 0);
  const fourteenStr = fourteenDaysAgo.toISOString().slice(0, 10);

  const [statusCounts, dailyRes, recentRes] = await Promise.all([
    candidateService.getStats(),
    // Apply-label counts are the real source of "applications".
    supabase
      .from('application_daily_counts')
      .select('candidate_id, date, total_apply_count, linkedin_count, dice_count, other_count, candidates(full_name)'),
    supabase
      .from('applications')
      .select(APPLICATION_LIST)
      .order('applied_at', { ascending: false })
      .limit(10),
  ]);

  if (dailyRes.error) throw dailyRes.error;
  if (recentRes.error) throw recentRes.error;

  let totalCandidates = 0;
  let activeSearches = 0;
  let placed = 0;

  const statusPipeline = Object.entries(statusCounts).map(([status, count]) => {
    totalCandidates += count;
    if (ACTIVE_STATUSES.has(status)) activeSearches += count;
    if (status === 'placed') placed += count;
    return { name: status.replace(/_/g, ' '), count };
  });

  const rows = (dailyRes.data ?? []) as DailyCountRow[];

  let totalApplications = 0;
  let appsThisWeek = 0;
  let appliedToday = 0;
  let linkedinTotal = 0;
  let diceTotal = 0;
  let otherTotal = 0;
  const perCandidate = new Map<string, { name: string; count: number }>();

  // Seed the last-14-days buckets so the line chart always has a full axis.
  const dayBuckets = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(fourteenDaysAgo);
    d.setDate(d.getDate() + i);
    dayBuckets.set(dayKey(d), 0);
  }

  for (const row of rows) {
    const apply = row.total_apply_count ?? 0;
    totalApplications += apply;
    if (row.date >= weekStr) appsThisWeek += apply;
    if (row.date === todayStr) appliedToday += apply;

    linkedinTotal += row.linkedin_count ?? 0;
    diceTotal += row.dice_count ?? 0;
    otherTotal += row.other_count ?? 0;

    if (row.date >= fourteenStr) {
      const key = dayKey(new Date(`${row.date}T00:00:00`));
      if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + apply);
    }

    if (apply > 0) {
      const existing = perCandidate.get(row.candidate_id);
      if (existing) {
        existing.count += apply;
      } else {
        perCandidate.set(row.candidate_id, { name: candidateName(row), count: apply });
      }
    }
  }

  const appsPerDay = Array.from(dayBuckets.entries()).map(([date, apps]) => ({ date, apps }));

  const sourceBreakdown = [
    { name: 'LinkedIn', count: linkedinTotal },
    { name: 'Dice', count: diceTotal },
    { name: 'Other', count: otherTotal },
  ].filter((s) => s.count > 0);

  const topCandidates = Array.from(perCandidate.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return {
    stats: {
      totalCandidates,
      activeSearches,
      placed,
      totalApplications,
      appsThisWeek,
      appliedToday,
    },
    statusPipeline,
    appsPerDay,
    sourceBreakdown,
    topCandidates,
    recentApps: (recentRes.data ?? []) as Application[],
  };
}
