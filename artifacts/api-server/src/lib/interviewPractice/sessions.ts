import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '../supabaseAdmin';
import { hashInterviewToken } from './crypto';
import { interviewPracticeEnv } from './env';

export interface InterviewSessionRow {
  id: string;
  candidate_id: string;
  created_by: string | null;
  title: string;
  job_description: string;
  resume_text: string;
  focus_notes: string;
  interview_type: string;
  difficulty: string;
  duration_minutes: number;
  status: string;
  secure_token_hash: string;
  token_uses_remaining: number;
  expires_at: string;
  started_at: string | null;
  completed_at: string | null;
  rolling_summary: string;
  created_at: string;
}

export interface CreateSessionInput {
  candidateId: string;
  createdBy: string;
  title: string;
  jobDescription: string;
  resumeText: string;
  focusNotes: string;
  interviewType: string;
  difficulty: string;
  durationMinutes: number;
  expiresAt: string;
  tokenHash: string;
}

export async function createInterviewSession(
  supabase: SupabaseClient,
  input: CreateSessionInput,
): Promise<InterviewSessionRow> {
  const { data, error } = await supabase
    .from('interview_sessions')
    .insert({
      candidate_id: input.candidateId,
      created_by: input.createdBy,
      title: input.title,
      job_description: input.jobDescription,
      resume_text: input.resumeText,
      focus_notes: input.focusNotes,
      interview_type: input.interviewType,
      difficulty: input.difficulty,
      duration_minutes: input.durationMinutes,
      secure_token_hash: input.tokenHash,
      expires_at: input.expiresAt,
      status: 'pending',
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Could not create interview session');
  return data as InterviewSessionRow;
}

export async function resolveSessionByToken(
  token: string,
  opts?: { forLive?: boolean },
): Promise<
  | { session: InterviewSessionRow; candidateName: string }
  | { invalid: true; reason: string }
  | null
> {
  const supabase = getSupabaseAdmin();
  const hash = hashInterviewToken(token);
  const { data: session, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('secure_token_hash', hash)
    .maybeSingle();

  if (error) throw error;
  if (!session) return null;

  const row = session as InterviewSessionRow;
  if (row.status === 'revoked') return { invalid: true, reason: 'revoked' };
  if (row.status === 'expired' || new Date(row.expires_at) < new Date()) {
    if (row.status !== 'expired') {
      await supabase.from('interview_sessions').update({ status: 'expired' }).eq('id', row.id);
    }
    return { invalid: true, reason: 'expired' };
  }
  if (opts?.forLive) {
    if (row.status === 'completed') {
      return { invalid: true, reason: 'already completed' };
    }
  }

  const { data: candidate } = await supabase
    .from('candidates')
    .select('full_name')
    .eq('id', row.candidate_id)
    .single();

  return {
    session: row,
    candidateName: (candidate?.full_name as string | undefined) ?? 'Candidate',
  };
}

export async function markSessionStarted(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('interview_sessions')
    .update({
      status: 'started',
      started_at: new Date().toISOString(),
      token_uses_remaining: 0,
    })
    .eq('id', sessionId)
    .in('status', ['pending', 'started']);
}

export async function appendInterviewMessage(
  sessionId: string,
  role: 'ai' | 'candidate' | 'system',
  messageText: string,
): Promise<void> {
  const text = messageText.trim();
  if (!text) return;
  const supabase = getSupabaseAdmin();
  await supabase.from('interview_messages').insert({
    interview_session_id: sessionId,
    role,
    message_text: text,
    message_at: new Date().toISOString(),
  });
}

export async function updateRollingSummary(sessionId: string, summary: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('interview_sessions')
    .update({ rolling_summary: summary.slice(0, 8000) })
    .eq('id', sessionId);
}

export async function markSessionCompleted(sessionId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('interview_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
}

export async function revokeSession(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('interview_sessions')
    .update({ status: 'revoked' })
    .eq('id', sessionId);
  if (error) throw error;
}

export function interviewLinkUrl(token: string): string {
  const base = interviewPracticeEnv.interviewLinkBaseUrl;
  return `${base}/interview/${token}`;
}

export async function listSessionsForCandidate(
  supabase: SupabaseClient,
  candidateId: string,
): Promise<InterviewSessionRow[]> {
  const { data, error } = await supabase
    .from('interview_sessions')
    .select('*')
    .eq('candidate_id', candidateId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InterviewSessionRow[];
}

export async function getSessionMessages(sessionId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('interview_messages')
    .select('*')
    .eq('interview_session_id', sessionId)
    .order('message_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getSessionResult(sessionId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('interview_results')
    .select('*')
    .eq('interview_session_id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function finishSessionEarly(session: InterviewSessionRow): Promise<void> {
  if (session.status === 'completed') return;
  const { generateInterviewFeedback } = await import('./feedback');
  await generateInterviewFeedback(session);
}
