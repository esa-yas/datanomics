import type { ImportedProfile } from '@/lib/profiles/importedProfiles';
import type { Candidate, WorkAuth, WorkMode } from '@/types';

/** Case/space-insensitive email key used to link imported profiles ↔ candidates. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function truthy(value: unknown): boolean {
  if (value === true) return true;
  const s = str(value).toLowerCase();
  return s === 'yes' || s === 'true' || s === 'y';
}

/** Split a free-text list ("Data Analyst | BI Developer, Analyst") into clean items. */
function splitList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/\s*[|/,;]\s*/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export function mapWorkAuth(profile: ImportedProfile): WorkAuth {
  const fd = profile.formData;
  if (truthy(fd.usCitizen)) return 'USC';
  if (truthy(fd.permanentResident)) return 'GC';

  const text = [profile.workAuth, str(fd.workAuthType), str(fd.authorizedToWork)]
    .join(' ')
    .toLowerCase();

  if (/\bus\s*citizen|citizenship|\busc\b/.test(text)) return 'USC';
  if (/green\s*card|permanent\s*resident|\bgc\b|lpr/.test(text)) return 'GC';
  if (/h-?1b/.test(text)) return 'H1B';
  if (/\bopt\b/.test(text)) return 'OPT';
  if (/\bcpt\b/.test(text)) return 'CPT';
  if (/\btn\b/.test(text)) return 'TN';
  if (/\bead\b/.test(text)) return 'EAD';
  return 'Other';
}

function mapWorkModes(profile: ImportedProfile): WorkMode[] {
  const text = [str(profile.formData.workPreference), str(profile.formData.preferredJobType)]
    .join(' ')
    .toLowerCase();
  const modes: WorkMode[] = [];
  if (text.includes('remote')) modes.push('remote');
  if (text.includes('hybrid')) modes.push('hybrid');
  if (text.includes('onsite') || text.includes('on-site') || text.includes('in office') || text.includes('in-office'))
    modes.push('onsite');
  return modes.length ? modes : ['remote'];
}

function experienceYears(profile: ImportedProfile): number {
  const raw = str(profile.formData.totalYearsExperience) || str(profile.formData.yearsInPrimaryRole);
  const match = raw.match(/\d+(\.\d+)?/);
  return match ? Math.round(Number(match[0])) : 0;
}

/** Fields shared with the CandidatesPage "Add Candidate" form (all strings). */
export interface CandidateFormFields {
  full_name: string;
  email: string;
  phone: string;
  work_auth: WorkAuth;
  target_roles: string;
  skills: string;
  status: string;
  experience_years: string;
}

export function profileToCandidateForm(profile: ImportedProfile): CandidateFormFields {
  const roles = splitList(profile.jobTitles);
  return {
    full_name: profile.name,
    email: profile.email,
    phone: profile.phone,
    work_auth: mapWorkAuth(profile),
    target_roles: roles.join(', '),
    skills: profile.skills.join(', '),
    status: 'profile_setup',
    experience_years: String(experienceYears(profile)),
  };
}

/**
 * Full candidate insert payload derived from an imported profile.
 * Resume/documents are intentionally excluded — resumes are tailored separately.
 * `overrides` lets the create form's edited values win.
 */
export function profileToCandidateCreate(
  profile: ImportedProfile,
  overrides: Partial<Candidate> = {},
): Partial<Candidate> {
  const fd = profile.formData;
  const roles = splitList(profile.jobTitles);
  const city = str(fd.city);
  const state = str(fd.state);
  const country = str(fd.country) || 'USA';
  const linkedin = str(fd.linkedinUrl);

  const base: Partial<Candidate> = {
    full_name: profile.name,
    email: profile.email,
    phone: profile.phone || '—',
    work_auth: mapWorkAuth(profile),
    target_roles: roles,
    skills: profile.skills,
    experience_years: experienceYears(profile),
    status: 'profile_setup',
    city: city || undefined,
    state: state || undefined,
    country,
    linkedin_url: linkedin || undefined,
    preferred_work_modes: mapWorkModes(profile),
    willing_to_relocate: truthy(fd.openToRelocation),
    preferred_states: [],
    total_applications: 0,
    total_replies: 0,
    total_interviews: 0,
    total_offers: 0,
    tags: [],
    notes: '',
    client_portal_enabled: false,
  };

  return { ...base, ...overrides };
}
