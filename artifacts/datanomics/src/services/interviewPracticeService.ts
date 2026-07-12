import { supabase } from '@/lib/supabase';

const API_BASE = '/api';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  if (res.status === 304) {
    throw new Error('Cached empty response — retrying…');
  }
  const text = await res.text();
  if (text.trimStart().startsWith('<')) {
    throw new Error(
      'API server returned HTML instead of JSON. Restart api-server on port 5001 (node build.mjs && PORT=5001 node dist/index.mjs).',
    );
  }
  if (!text.trim()) {
    throw new Error(`Empty response (${res.status})`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || `Request failed (${res.status})`);
  }
}

async function interviewFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
}

async function staffAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export type InterviewSessionStatus = 'pending' | 'started' | 'completed' | 'expired' | 'revoked';
export type InterviewType = 'recruiter_screen' | 'behavioral' | 'technical' | 'final_round';
export type InterviewDifficulty = 'easy' | 'medium' | 'hard';
export type HiringReadiness = 'low' | 'medium' | 'high';

export interface InterviewSession {
  id: string;
  candidate_id: string;
  created_by: string | null;
  title: string;
  job_description: string;
  resume_text: string;
  focus_notes: string;
  interview_type: InterviewType;
  difficulty: InterviewDifficulty;
  duration_minutes: number;
  status: InterviewSessionStatus;
  expires_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  result?: InterviewResult | null;
}

export interface InterviewResult {
  id: string;
  interview_session_id: string;
  overall_score: number | null;
  communication_score: number | null;
  technical_score: number | null;
  jd_alignment_score: number | null;
  confidence_score: number | null;
  strengths: string[];
  weaknesses: string[];
  missed_keywords: string[];
  suggested_improvements: string[];
  recommended_practice: string[];
  final_summary: string;
  hiring_readiness: HiringReadiness | null;
  created_at: string;
}

export interface InterviewMessage {
  id: string;
  interview_session_id: string;
  role: 'ai' | 'candidate' | 'system';
  message_text: string;
  message_at: string;
}

export interface CreateInterviewSessionInput {
  candidateId: string;
  title: string;
  jobDescription: string;
  resumeText: string;
  focusNotes: string;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  durationMinutes: 15 | 30 | 45 | 60;
  expiresAt?: string;
}

export interface PublicInterviewInfo {
  candidateName: string;
  title: string;
  durationMinutes: number;
  interviewType: InterviewType;
  difficulty: InterviewDifficulty;
  status: InterviewSessionStatus;
  expiresAt: string;
}

export const interviewPracticeService = {
  async createSession(input: CreateInterviewSessionInput): Promise<{
    session: InterviewSession;
    url: string;
    expiresAt: string;
  }> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/sessions`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
      body: JSON.stringify(input),
    });
    const body = await parseJsonResponse<{ session: InterviewSession; url: string; expiresAt: string; error?: string }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Failed to create interview session');
    return body;
  },

  async listForCandidate(candidateId: string): Promise<InterviewSession[]> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/candidates/${candidateId}/sessions`, {
      headers: await staffAuthHeaders(),
    });
    const body = await parseJsonResponse<InterviewSession[] & { error?: string }>(res);
    if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Failed to load sessions');
    return body;
  },

  async revokeSession(sessionId: string): Promise<void> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/sessions/${sessionId}/revoke`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
    });
    const body = await parseJsonResponse<{ error?: string }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Failed to revoke session');
  },

  async getStaffResult(sessionId: string): Promise<{
    session: InterviewSession;
    result: InterviewResult | null;
    messages: InterviewMessage[];
  }> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/sessions/${sessionId}/result`, {
      headers: await staffAuthHeaders(),
    });
    const body = await parseJsonResponse<{
      session: InterviewSession;
      result: InterviewResult | null;
      messages: InterviewMessage[];
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Failed to load result');
    return body;
  },

  async validatePublicToken(token: string): Promise<PublicInterviewInfo> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/public/${encodeURIComponent(token)}`);
    const body = await parseJsonResponse<PublicInterviewInfo & { error?: string }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Invalid interview link');
    return body;
  },

  async getPublicResult(token: string): Promise<{
    session: Pick<InterviewSession, 'id' | 'title' | 'status' | 'completed_at' | 'duration_minutes'>;
    result: InterviewResult | null;
    messages: InterviewMessage[];
  }> {
    const res = await interviewFetch(
      `${API_BASE}/interview-practice/public/${encodeURIComponent(token)}/result?t=${Date.now()}`,
    );
    const body = await parseJsonResponse<{
      session: Pick<InterviewSession, 'id' | 'title' | 'status' | 'completed_at' | 'duration_minutes'>;
      result: InterviewResult | null;
      messages: InterviewMessage[];
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Result not available');
    return body;
  },

  async getVoiceToken(token: string): Promise<{
    conversationToken: string;
    overrides: {
      agent: {
        prompt: { prompt: string };
        firstMessage: string;
      };
    };
  }> {
    const res = await interviewFetch(
      `${API_BASE}/interview-practice/public/${encodeURIComponent(token)}/voice-token?t=${Date.now()}`,
    );
    const body = await parseJsonResponse<{
      conversationToken: string;
      overrides: {
        agent: {
          prompt: { prompt: string };
          firstMessage: string;
        };
      };
      error?: string;
    }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Failed to get voice session token');
    if (!body.conversationToken) throw new Error('Voice service returned an empty token');
    if (!body.overrides) throw new Error('Voice service returned incomplete session config');
    return { conversationToken: body.conversationToken, overrides: body.overrides };
  },

  async finishPublicInterview(token: string, conversationId?: string): Promise<void> {
    const res = await interviewFetch(`${API_BASE}/interview-practice/public/${encodeURIComponent(token)}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversationId ? { conversationId } : {}),
    });
    const body = await parseJsonResponse<{ error?: string }>(res);
    if (!res.ok) throw new Error(body.error ?? 'Failed to finish interview');
  },
};
