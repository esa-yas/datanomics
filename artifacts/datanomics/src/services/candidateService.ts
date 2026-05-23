import { supabase } from '../lib/supabase';
import type { Candidate, CandidateNote, FollowUp } from '../types';

export const candidateService = {
  async getAll() {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Candidate[];
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Candidate;
  },

  async getByAssignee(uid: string) {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('primary_assignee_id', uid)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data as Candidate[];
  },

  async getByStatus(status: string) {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .eq('status', status)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data as Candidate[];
  },

  async create(candidate: Partial<Candidate>) {
    const { data, error } = await supabase
      .from('candidates')
      .insert(candidate)
      .select()
      .single();
    if (error) throw error;
    return data as Candidate;
  },

  async update(id: string, updates: Partial<Candidate>) {
    const { data, error } = await supabase
      .from('candidates')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Candidate;
  },

  async delete(id: string) {
    const { error } = await supabase.from('candidates').delete().eq('id', id);
    if (error) throw error;
  },

  async addNote(candidateId: string, content: string, authorId: string, authorName: string) {
    const { error } = await supabase.from('candidate_notes').insert({
      candidate_id: candidateId,
      content,
      author_id: authorId,
      author_name: authorName,
    });
    if (error) throw error;
  },

  async getNotes(candidateId: string) {
    const { data, error } = await supabase
      .from('candidate_notes')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as CandidateNote[];
  },

  async getFollowUps(candidateId: string) {
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('due_date', { ascending: true });
    if (error) throw error;
    return data as FollowUp[];
  },

  async addFollowUp(followUp: Partial<FollowUp>) {
    const { data, error } = await supabase
      .from('follow_ups')
      .insert(followUp)
      .select()
      .single();
    if (error) throw error;
    return data as FollowUp;
  },

  async completeFollowUp(id: string) {
    const { error } = await supabase
      .from('follow_ups')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async getStats() {
    const { data, error } = await supabase.from('candidates').select('status');
    if (error) throw error;
    const counts: Record<string, number> = {};
    for (const row of data) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  },
};
