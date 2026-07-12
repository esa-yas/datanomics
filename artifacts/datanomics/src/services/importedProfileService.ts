import { supabase } from '@/lib/supabase';
import { normalizeImportedEntries, type ImportedProfile } from '@/lib/profiles/importedProfiles';

interface ImportedProfileRow {
  id: string;
  external_id: string | null;
  candidate_user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  job_titles: string | null;
  work_auth: string | null;
  skills: string[] | null;
  job_match: number | null;
  applied: boolean;
  application_date: string | null;
  follow_up_date: string | null;
  submitted_at: string | null;
  form_data: Record<string, unknown>;
  raw: Record<string, unknown>;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

const CHUNK = 500;

function toRow(p: ImportedProfile, uploadedBy: string | null): Record<string, unknown> {
  return {
    external_id: p.id || null,
    candidate_user_id: p.userId || null,
    full_name: p.name,
    email: p.email || null,
    phone: p.phone || null,
    location: p.location || null,
    job_titles: p.jobTitles || null,
    work_auth: p.workAuth || null,
    skills: p.skills,
    job_match: p.jobMatch,
    applied: p.applied,
    application_date: p.applicationDate || null,
    follow_up_date: p.followUpDate || null,
    submitted_at: p.submittedAt || null,
    form_data: p.formData,
    raw: p.raw,
    uploaded_by: uploadedBy,
  };
}

export const importedProfileService = {
  /** Fetch all imported profiles, normalized for display. */
  async list(): Promise<ImportedProfile[]> {
    const { data, error } = await supabase
      .from('imported_profiles')
      .select('raw')
      .order('job_match', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    const rawEntries = ((data ?? []) as Pick<ImportedProfileRow, 'raw'>[]).map((r) => r.raw);
    return normalizeImportedEntries(rawEntries);
  },

  /** Replace the entire dataset with the freshly uploaded profiles. */
  async replaceAll(profiles: ImportedProfile[], uploadedBy: string | null): Promise<void> {
    const { error: delError } = await supabase
      .from('imported_profiles')
      .delete()
      .not('id', 'is', null);
    if (delError) throw delError;

    const rows = profiles.map((p) => toRow(p, uploadedBy));
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from('imported_profiles').insert(rows.slice(i, i + CHUNK));
      if (error) throw error;
    }
  },

  /** Fetch a single imported profile matching an email (case-insensitive), if any. */
  async getByEmail(email: string): Promise<ImportedProfile | null> {
    const normalized = email.trim();
    if (!normalized) return null;
    const { data, error } = await supabase
      .from('imported_profiles')
      .select('raw')
      .ilike('email', normalized)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const rawEntries = ((data ?? []) as Pick<ImportedProfileRow, 'raw'>[]).map((r) => r.raw);
    return normalizeImportedEntries(rawEntries)[0] ?? null;
  },

  /** Remove all imported profiles. */
  async clear(): Promise<void> {
    const { error } = await supabase.from('imported_profiles').delete().not('id', 'is', null);
    if (error) throw error;
  },
};
