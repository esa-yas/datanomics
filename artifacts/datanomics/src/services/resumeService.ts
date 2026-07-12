import { supabase } from '../lib/supabase';
import { waitForSupabaseSession, withTimeout } from '../lib/fetchUtils';
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
      .insert({
        certifications: [],
        experience: [],
        added_keywords: [],
        ...resume,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Resume;
  },

  async saveTailoredVersion(params: {
    candidateId: string;
    createdBy: string;
    versionName: string;
    versionNumber: number;
    jobTitle: string;
    summary: string;
    skills: string[];
    rawText: string;
    docxBlob?: Blob | null;
    pdfBlob?: Blob | null;
    addedKeywords?: string[];
    matchScoreBefore?: number;
    matchScoreAfter?: number;
    jdSnapshot?: string;
  }): Promise<Resume> {
    await waitForSupabaseSession();

    const row = await withTimeout(
      this.create({
        candidate_id: params.candidateId,
        version_name: params.versionName,
        version_number: params.versionNumber,
        type: 'tailored',
        job_title: params.jobTitle,
        summary: params.summary,
        skills: params.skills,
        raw_text: params.rawText,
        added_keywords: params.addedKeywords ?? [],
        match_score_before: params.matchScoreBefore,
        match_score_after: params.matchScoreAfter,
        jd_snapshot: params.jdSnapshot,
        tailored_at: new Date().toISOString(),
        is_active: false,
        created_by: params.createdBy,
      }),
      20_000,
      'Save resume record',
    );

    const stamp = Date.now();
    const fileUpdates: Partial<Resume> = {};
    const uploadErrors: string[] = [];

    if (params.docxBlob) {
      try {
        const docxPath = `${params.candidateId}/${stamp}-tailored.docx`;
        const docxUp = await withTimeout(
          supabase.storage.from('resumes').upload(docxPath, params.docxBlob, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          }),
          45_000,
          'DOCX upload',
        );
        if (docxUp.error) throw docxUp.error;
        fileUpdates.docx_file_url = supabase.storage.from('resumes').getPublicUrl(docxUp.data.path).data
          .publicUrl;
      } catch (err) {
        uploadErrors.push(err instanceof Error ? err.message : 'DOCX upload failed');
      }
    }

    if (params.pdfBlob) {
      try {
        const pdfPath = `${params.candidateId}/${stamp}-tailored.pdf`;
        const pdfUp = await withTimeout(
          supabase.storage.from('resumes').upload(pdfPath, params.pdfBlob, {
            cacheControl: '3600',
            upsert: true,
            contentType: 'application/pdf',
          }),
          45_000,
          'PDF upload',
        );
        if (pdfUp.error) throw pdfUp.error;
        fileUpdates.pdf_file_url = supabase.storage.from('resumes').getPublicUrl(pdfUp.data.path).data.publicUrl;
      } catch (err) {
        uploadErrors.push(err instanceof Error ? err.message : 'PDF upload failed');
      }
    }

    if (fileUpdates.docx_file_url || fileUpdates.pdf_file_url) {
      await withTimeout(this.update(row.id, fileUpdates), 15_000, 'Attach resume files');
    }

    if (uploadErrors.length > 0) {
      console.warn('[saveTailoredVersion] file upload issues:', uploadErrors);
    }

    return { ...row, ...fileUpdates };
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
