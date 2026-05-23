import { supabase } from '../lib/supabase';
import type { Resume } from '../types';

export const resumeService = {
  async getByCandidate(candidateId: string) {
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as Resume[];
  },

  async getBaseResume(candidateId: string) {
    const { data } = await supabase
      .from('resumes')
      .select('*')
      .eq('candidate_id', candidateId)
      .eq('type', 'base')
      .eq('is_active', true)
      .single();
    return data as Resume | null;
  },

  async getById(id: string) {
    const { data, error } = await supabase
      .from('resumes')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data as Resume;
  },

  async create(resume: Partial<Resume>) {
    const { data, error } = await supabase
      .from('resumes')
      .insert(resume)
      .select()
      .single();
    if (error) throw error;
    return data as Resume;
  },

  async update(id: string, updates: Partial<Resume>) {
    const { error } = await supabase.from('resumes').update(updates).eq('id', id);
    if (error) throw error;
  },

  async uploadFile(candidateId: string, resumeId: string, file: File, type: 'docx' | 'pdf') {
    const path = `resumes/${candidateId}/${resumeId}.${type}`;
    const { error: uploadError } = await supabase.storage
      .from('resumes')
      .upload(path, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('resumes').getPublicUrl(path);
    const field = type === 'docx' ? 'docx_file_url' : 'pdf_file_url';
    await supabase.from('resumes').update({ [field]: data.publicUrl }).eq('id', resumeId);
    return data.publicUrl;
  },

  async setActive(id: string, candidateId: string) {
    await supabase.from('resumes').update({ is_active: false }).eq('candidate_id', candidateId).eq('type', 'base');
    await supabase.from('resumes').update({ is_active: true }).eq('id', id);
  },
};
