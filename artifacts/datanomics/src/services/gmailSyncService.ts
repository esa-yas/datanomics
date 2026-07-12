import { supabase } from '@/lib/supabase';

const API_BASE = '/api';

async function staffAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export type GoogleConnectionStatus = 'pending' | 'connected' | 'failed' | 'disconnected';

export interface GoogleConnectionPublic {
  id: string;
  candidate_id: string;
  google_email: string | null;
  apply_label_id: string | null;
  status: GoogleConnectionStatus;
  connected_at: string | null;
  disconnected_at: string | null;
  last_synced_at: string | null;
  error_message: string | null;
}

export interface ApplicationDailyCount {
  id: string;
  candidate_id: string;
  date: string;
  total_apply_count: number;
  linkedin_count: number;
  dice_count: number;
  other_count: number;
  daily_goal: number;
  remaining_count: number;
  last_synced_at: string | null;
}

export interface GmailSyncLog {
  id: string;
  candidate_id: string;
  sync_started_at: string;
  sync_finished_at: string | null;
  status: 'running' | 'success' | 'failed';
  messages_found: number;
  messages_imported: number;
  error_message: string | null;
}

export type GmailApplySource = 'LinkedIn' | 'Dice' | 'Other';

export interface GmailApplyMessage {
  id: string;
  candidate_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  received_date: string;
  detected_source: GmailApplySource;
  candidates?: { full_name: string } | null;
}

export interface GmailInterviewMessage {
  id: string;
  candidate_id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  received_date: string;
}

export interface InterviewStats {
  total: number;
  last7Days: number;
  recent: GmailInterviewMessage[];
}

export const gmailSyncService = {
  async getConnection(candidateId: string): Promise<GoogleConnectionPublic | null> {
    const { data, error } = await supabase
      .from('google_connections_public')
      .select('*')
      .eq('candidate_id', candidateId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getTodayCount(candidateId: string): Promise<ApplicationDailyCount | null> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('application_daily_counts')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('date', today)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async getRecentSyncLogs(candidateId: string, limit = 5): Promise<GmailSyncLog[]> {
    const { data, error } = await supabase
      .from('gmail_sync_logs')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('sync_started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async getAllSyncLogs(candidateId: string): Promise<GmailSyncLog[]> {
    const { data, error } = await supabase
      .from('gmail_sync_logs')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('sync_started_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async generateConnectLink(candidateId: string): Promise<{ url: string; expiresAt: string }> {
    const res = await fetch(`${API_BASE}/gmail/connect-link`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
      body: JSON.stringify({ candidateId }),
    });
    const json = (await res.json()) as { error?: string; detail?: string; url?: string; expiresAt?: string };
    if (!res.ok) {
      const msg = json.detail ? `${json.error}: ${json.detail}` : json.error ?? 'Failed to generate link';
      throw new Error(msg);
    }
    return { url: json.url!, expiresAt: json.expiresAt! };
  },

  async syncNow(candidateId: string, options?: { full?: boolean }) {
    const res = await fetch(`${API_BASE}/gmail/sync`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
      body: JSON.stringify({ candidateId, full: options?.full === true }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Sync failed');
    return json;
  },

  async disconnect(candidateId: string) {
    const res = await fetch(`${API_BASE}/gmail/disconnect`, {
      method: 'POST',
      headers: await staffAuthHeaders(),
      body: JSON.stringify({ candidateId }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Disconnect failed');
    return json;
  },

  async validatePublicConnectToken(token: string) {
    const res = await fetch(`${API_BASE}/gmail/connect/${encodeURIComponent(token)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Invalid link');
    return json as {
      candidateId: string;
      candidateName: string;
      oauthStartUrl: string;
    };
  },

  oauthStartUrl(token: string): string {
    return `${API_BASE}/gmail/oauth/start?token=${encodeURIComponent(token)}`;
  },

  async getAllTodayCounts(): Promise<ApplicationDailyCount[]> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('application_daily_counts')
      .select('*, candidates(full_name)')
      .eq('date', today)
      .order('total_apply_count', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async listApplyMessages(options?: { limit?: number; candidateId?: string }): Promise<GmailApplyMessage[]> {
    const limit = options?.limit ?? 100;
    let query = supabase
      .from('gmail_apply_messages')
      .select('id, candidate_id, from_email, from_name, subject, received_date, detected_source, candidates(full_name)')
      .order('received_date', { ascending: false })
      .limit(limit);
    if (options?.candidateId) {
      query = query.eq('candidate_id', options.candidateId);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as unknown as GmailApplyMessage[];
  },

  async listInterviewMessages(candidateId: string, limit = 100): Promise<GmailInterviewMessage[]> {
    const { data, error } = await supabase
      .from('gmail_interview_messages')
      .select('id, candidate_id, from_email, from_name, subject, received_date')
      .eq('candidate_id', candidateId)
      .order('received_date', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as GmailInterviewMessage[];
  },

  async getInterviewStats(candidateId: string): Promise<InterviewStats> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const since = sevenDaysAgo.toISOString();

    const [allRes, recentRes, listRes] = await Promise.all([
      supabase
        .from('gmail_interview_messages')
        .select('id', { count: 'exact', head: true })
        .eq('candidate_id', candidateId),
      supabase
        .from('gmail_interview_messages')
        .select('id', { count: 'exact', head: true })
        .eq('candidate_id', candidateId)
        .gte('received_date', since),
      supabase
        .from('gmail_interview_messages')
        .select('id, candidate_id, from_email, from_name, subject, received_date')
        .eq('candidate_id', candidateId)
        .gte('received_date', since)
        .order('received_date', { ascending: false })
        .limit(10),
    ]);

    if (allRes.error) throw allRes.error;
    if (recentRes.error) throw recentRes.error;
    if (listRes.error) throw listRes.error;

    return {
      total: allRes.count ?? 0,
      last7Days: recentRes.count ?? 0,
      recent: (listRes.data ?? []) as GmailInterviewMessage[],
    };
  },
};
