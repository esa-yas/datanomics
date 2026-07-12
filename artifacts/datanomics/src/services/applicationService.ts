import { supabase } from '../lib/supabase';
import type { Application, ApplicationStatus, ApplicationStatusHistory } from '../types';

const APPLICATION_LIST_COLUMNS =
  'id, candidate_id, candidate_name, company, job_title, status, quality_score, applied_at, flagged, flag_reason, job_source, work_mode, job_url, pay_rate, pay_type, applied_by, notes, last_activity_at';

export const applicationService = {
  async getList(filters?: { status?: ApplicationStatus; flagged?: boolean; limit?: number }) {
    let q = supabase
      .from('applications')
      .select(APPLICATION_LIST_COLUMNS)
      .order('applied_at', { ascending: false });
    if (filters?.status) q = q.eq('status', filters.status);
    if (filters?.flagged !== undefined) q = q.eq('flagged', filters.flagged);
    if (filters?.limit) q = q.limit(filters.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data as Application[];
  },
  async create(app: Partial<Application>) {
    const { data, error } = await supabase
      .from('applications')
      .insert(app)
      .select()
      .single();
    if (error) throw error;
    return data as Application;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('applications')
      .select('*, application_status_history(*)')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  },

  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from('applications')
      .select('*, application_status_history(*)')
      .eq('candidate_id', candidateId)
      .order('applied_at', { ascending: false });
    if (error) throw error;
    return data as Application[];
  },

  async getByEmployee(uid: string) {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('applied_by', uid)
      .order('applied_at', { ascending: false });
    if (error) throw error;
    return data as Application[];
  },

  async getAll(filters?: { status?: ApplicationStatus; flagged?: boolean; limit?: number }) {
    return this.getList(filters);
  },

  async update(id: string, updates: Partial<Application>) {
    const { data, error } = await supabase
      .from('applications')
      .update({ ...updates, last_activity_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Application;
  },

  async updateStatus(id: string, status: ApplicationStatus) {
    const { error } = await supabase
      .from('applications')
      .update({ status, last_activity_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async checkDuplicate(candidateId: string, company: string, jobTitle: string) {
    const { data } = await supabase
      .from('applications')
      .select('id')
      .eq('candidate_id', candidateId)
      .eq('company', company)
      .eq('job_title', jobTitle)
      .limit(1);
    return (data?.length ?? 0) > 0;
  },

  async getThisWeek(candidateId?: string) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    let q = supabase
      .from('applications')
      .select('*')
      .gte('applied_at', weekAgo.toISOString());
    if (candidateId) q = q.eq('candidate_id', candidateId);
    const { data, error } = await q;
    if (error) throw error;
    return data as Application[];
  },

  async flag(id: string, reason: string) {
    const { error } = await supabase
      .from('applications')
      .update({ flagged: true, flag_reason: reason })
      .eq('id', id);
    if (error) throw error;
  },

  async unflag(id: string) {
    const { error } = await supabase
      .from('applications')
      .update({ flagged: false, flag_reason: null })
      .eq('id', id);
    if (error) throw error;
  },

  async getStatusHistory(applicationId: string) {
    const { data, error } = await supabase
      .from('application_status_history')
      .select('*')
      .eq('application_id', applicationId)
      .order('changed_at', { ascending: false });
    if (error) throw error;
    return data as ApplicationStatusHistory[];
  },

  async getDashboardStats() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { data, error } = await supabase
      .from('applications')
      .select('status, flagged, quality_score, applied_at')
      .gte('applied_at', weekAgo.toISOString());
    if (error) throw error;
    return data;
  },
};
