import { supabase } from '../lib/supabase';
import type { RecruiterMessage } from '../types';

/** recruiter_messages has no candidate_name column — join candidates for display name */
const MESSAGE_LIST_COLUMNS =
  'id, candidate_id, direction, channel, status, priority, subject, body, received_at, assigned_to, ai_reply, actual_reply, replied_at, replied_by, created_at, candidates(full_name)';

export const recruiterMessageService = {
  async getList(filters?: { status?: string; priority?: string }) {
    let q = supabase
      .from('recruiter_messages')
      .select(MESSAGE_LIST_COLUMNS)
      .order('received_at', { ascending: false });
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.priority) q = q.eq('priority', filters.priority);
    const { data, error } = await q;
    if (error) throw error;
    return data as RecruiterMessage[];
  },

  async getUnreadCount(assignedTo?: string) {
    let q = supabase
      .from('recruiter_messages')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'unread');
    if (assignedTo) q = q.eq('assigned_to', assignedTo);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  },
  async create(msg: Partial<RecruiterMessage>) {
    const { data, error } = await supabase
      .from('recruiter_messages')
      .insert(msg)
      .select()
      .single();
    if (error) throw error;
    return data as RecruiterMessage;
  },

  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from('recruiter_messages')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('received_at', { ascending: false });
    if (error) throw error;
    return data as RecruiterMessage[];
  },

  async getUnread(assignedTo?: string) {
    let q = supabase
      .from('recruiter_messages')
      .select('*')
      .eq('status', 'unread')
      .order('received_at', { ascending: false });
    if (assignedTo) q = q.eq('assigned_to', assignedTo);
    const { data, error } = await q;
    if (error) throw error;
    return data as RecruiterMessage[];
  },

  async getAll(filters?: { status?: string; priority?: string }) {
    return this.getList(filters);
  },

  async markRead(id: string) {
    const { error } = await supabase
      .from('recruiter_messages')
      .update({ status: 'read' })
      .eq('id', id);
    if (error) throw error;
  },

  async markReplied(id: string, repliedBy: string, reply: string) {
    const { error } = await supabase
      .from('recruiter_messages')
      .update({
        status: 'replied',
        replied_at: new Date().toISOString(),
        replied_by: repliedBy,
        actual_reply: reply,
      })
      .eq('id', id);
    if (error) throw error;
  },

  async setAiReply(id: string, aiReply: string) {
    const { error } = await supabase
      .from('recruiter_messages')
      .update({ ai_reply: aiReply })
      .eq('id', id);
    if (error) throw error;
  },

  async update(id: string, updates: Partial<RecruiterMessage>) {
    const { error } = await supabase
      .from('recruiter_messages')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  },
};
