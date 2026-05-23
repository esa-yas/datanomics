import { supabase } from '../lib/supabase';
import type { RecruiterMessage } from '../types';

export const recruiterMessageService = {
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
    let q = supabase
      .from('recruiter_messages')
      .select('*')
      .order('received_at', { ascending: false });
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.priority) q = q.eq('priority', filters.priority);
    const { data, error } = await q;
    if (error) throw error;
    return data as RecruiterMessage[];
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
