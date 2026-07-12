import { supabase } from '../lib/supabase';
import type { Candidate, CandidateNote, FollowUp } from '../types';

/** Columns needed for list/table views — avoids loading notes, passwords, etc. */
const CANDIDATE_LIST_COLUMNS =
  'id, full_name, email, phone, status, work_auth, target_roles, skills, experience_years, primary_assignee_id, total_applications, total_replies, total_interviews, total_offers, city, state, linkedin_url, client_portal_enabled, created_at, updated_at, preferred_work_modes, willing_to_relocate, country, preferred_states, tags';

const CANDIDATE_PICKLIST_COLUMNS = 'id, full_name, email, status, target_roles, work_auth, skills';

export const candidateService = {
  async getList() {
    const { data, error } = await supabase
      .from('candidates')
      .select(CANDIDATE_LIST_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Candidate[];
  },

  async getPicklist() {
    const { data, error } = await supabase
      .from('candidates')
      .select(CANDIDATE_PICKLIST_COLUMNS)
      .order('full_name', { ascending: true });
    if (error) throw error;
    return data as Pick<Candidate, 'id' | 'full_name' | 'email' | 'status' | 'target_roles' | 'work_auth' | 'skills'>[];
  },

  /** Full row — use for detail views only */
  async getAll() {
    return this.getList();
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
    for (const row of data ?? []) {
      counts[row.status] = (counts[row.status] ?? 0) + 1;
    }
    return counts;
  },
};
