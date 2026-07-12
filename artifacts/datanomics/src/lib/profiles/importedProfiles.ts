/**
 * Imported profile system.
 *
 * Parses the candidate intake JSON (array of submissions with a rich `formData`
 * object) into normalized, display-ready profiles. Nothing is dropped — every
 * field is grouped for a readable detail view and the full raw entry is kept for
 * the "raw JSON" view. Profiles persist in localStorage so a reload keeps them.
 */

export type FieldKind = 'text' | 'password' | 'image' | 'link' | 'email' | 'phone';

export interface ProfileField {
  key: string;
  label: string;
  value: string;
  kind: FieldKind;
}

export interface ProfileGroup {
  title: string;
  fields: ProfileField[];
}

export interface ImportedProfile {
  key: string;
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  jobTitles: string;
  skills: string[];
  workAuth: string;
  jobMatch: number | null;
  applied: boolean;
  applicationDate: string | null;
  followUpDate: string | null;
  submittedAt: string | null;
  agreementSigned: boolean;
  signatureImage: string | null;
  groups: ProfileGroup[];
  searchText: string;
  formData: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface ParseResult {
  profiles: ImportedProfile[];
  errors: string[];
}

type Dict = Record<string, unknown>;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return value
      .map((item) => {
        if (isDict(item)) {
          const name = item.name ?? item.label ?? '';
          const detail = item.proficiency ?? item.level ?? '';
          return detail ? `${String(name)} (${String(detail)})` : String(name);
        }
        return formatValue(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (isDict(value)) {
    return Object.entries(value)
      .map(([k, v]) => `${humanizeKey(k)}: ${formatValue(v)}`)
      .filter((s) => !s.endsWith(': '))
      .join(' · ');
  }
  return String(value);
}

function fieldKind(key: string, value: string): FieldKind {
  const lower = key.toLowerCase();
  if (lower.includes('password')) return 'password';
  if (value.startsWith('data:image')) return 'image';
  if (lower.includes('email')) return 'email';
  if (lower.includes('phone')) return 'phone';
  if (/^https?:\/\//i.test(value) || lower.includes('url') || lower.includes('linkedin') || lower.includes('portfolio')) {
    return 'link';
  }
  return 'text';
}

// Ordered display groups. Every listed key is pulled from formData; anything not
// listed is swept into an "Other details" group so nothing is ever hidden.
const GROUP_LAYOUT: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Contact & identity',
    keys: [
      'fullName', 'userId', 'jobSearchEmail', 'jobSearchEmailPassword', 'phoneNumber',
      'streetAddress', 'city', 'state', 'zipCode', 'country',
      'linkedinUrl', 'linkedinPassword', 'portfolio',
    ],
  },
  {
    title: 'Job preferences',
    keys: [
      'jobTitles', 'preferredJobType', 'workPreference', 'preferredLocations',
      'minimumSalary', 'idealSalaryRange', 'openToRelocation',
      'contractRoles', 'governmentRoles', 'startupRoles', 'minimumMatchPercent',
      'atsOptimization', 'blacklistedCompanies',
    ],
  },
  {
    title: 'Experience',
    keys: [
      'totalYearsExperience', 'yearsInPrimaryRole', 'currentJobTitle', 'currentEmployer',
      'currentlyEmployed', 'noticePeriod', 'laidOffRecently',
    ],
  },
  {
    title: 'Skills & tools',
    keys: [
      'primarySkills', 'secondarySkills', 'dailyTools', 'rustyTools',
      'databases', 'cloudPlatforms', 'programmingLanguages',
    ],
  },
  {
    title: 'Work authorization',
    keys: [
      'authorizedToWork', 'workAuthType', 'requiresVisa', 'usCitizen', 'permanentResident',
      'securityClearance', 'clearanceDetails', 'felonyConviction', 'backgroundCheck',
    ],
  },
  {
    title: 'Narrative',
    keys: ['professionalSummary', 'biggestAchievement', 'challengingProblem', 'additionalNotes'],
  },
  {
    title: 'Work style',
    keys: [
      'comfortableDeadlines', 'comfortableIndependent', 'comfortableCrossFunctional',
      'willingToLearn', 'fastPacedEnvironment',
    ],
  },
  {
    title: 'Voluntary disclosures',
    keys: ['gender', 'ethnicity', 'veteranStatus', 'disabilityStatus'],
  },
  {
    title: 'Documents',
    keys: ['resumeName', 'resumeUrl', 'paymentProofName', 'paymentProofUrl'],
  },
  {
    title: 'Agreement',
    keys: ['confirmAccuracy', 'authorizationSignature', 'agreementSigned', 'signatureType', 'agreementDate'],
  },
];

// Keys that are noise or handled elsewhere (kept in raw JSON regardless).
const SKIP_KEYS = new Set(['uniqueId', 'resume', 'paymentProof', 'agreementSignature']);

// Uploaded documents are stored as relative paths (e.g. "uploads/resume_123.pdf").
// Prefix them with the forms host so they become downloadable links.
const FORMS_BASE_URL = 'https://datanomicstech.com/forms/';
const DOCUMENT_URL_KEYS = new Set(['resumeUrl', 'paymentProofUrl']);

export function resolveFormsUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return FORMS_BASE_URL + trimmed.replace(/^\/+/, '');
}

function buildGroups(formData: Dict): ProfileGroup[] {
  const used = new Set<string>();
  const groups: ProfileGroup[] = [];

  for (const layout of GROUP_LAYOUT) {
    const fields: ProfileField[] = [];
    for (const key of layout.keys) {
      used.add(key);
      if (!(key in formData)) continue;
      let value = formatValue(formData[key]);
      if (!value) continue;
      if (DOCUMENT_URL_KEYS.has(key)) value = resolveFormsUrl(value);
      fields.push({ key, label: humanizeKey(key), value, kind: fieldKind(key, value) });
    }
    if (fields.length) groups.push({ title: layout.title, fields });
  }

  // Sweep any remaining populated keys so the view is truly complete.
  const otherFields: ProfileField[] = [];
  for (const [key, rawValue] of Object.entries(formData)) {
    if (used.has(key) || SKIP_KEYS.has(key)) continue;
    let value = formatValue(rawValue);
    if (!value) continue;
    if (DOCUMENT_URL_KEYS.has(key)) value = resolveFormsUrl(value);
    otherFields.push({ key, label: humanizeKey(key), value, kind: fieldKind(key, value) });
  }
  if (otherFields.length) groups.push({ title: 'Other details', fields: otherFields });

  return groups;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value);
}

function toSkills(formData: Dict): string[] {
  const raw = [formData.primarySkills, formData.secondarySkills, formData.dailyTools, formData.databases]
    .map(formatValue)
    .filter(Boolean)
    .join(', ');
  const langs = formatValue(formData.programmingLanguages);
  const combined = [raw, langs].filter(Boolean).join(', ');
  return Array.from(
    new Set(
      combined
        .split(/[,;/]/)
        .map((s) => s.trim())
        .filter((s) => s && s.length <= 40),
    ),
  );
}

function normalizeEntry(entry: Dict, index: number): ImportedProfile {
  const formData: Dict = isDict(entry.formData) ? entry.formData : {};

  const name = str(formData.fullName) || str(entry.id) || `Profile ${index + 1}`;
  const email = str(formData.jobSearchEmail);
  const phone = str(formData.phoneNumber);
  const location = [str(formData.city), str(formData.state)].filter(Boolean).join(', ');
  const jobTitles = str(formData.jobTitles);
  const workAuth = str(formData.workAuthType);
  const skills = toSkills(formData);

  const matchRaw = entry.jobMatch;
  const jobMatch = typeof matchRaw === 'number' ? matchRaw : Number.isFinite(Number(matchRaw)) && str(matchRaw) ? Number(matchRaw) : null;

  const signatureRaw = str(entry.agreementSignature);
  const signatureImage = signatureRaw.startsWith('data:image') ? signatureRaw : null;

  const searchText = [
    name, email, phone, location, jobTitles, workAuth,
    str(formData.currentEmployer), str(formData.currentJobTitle),
    str(formData.professionalSummary), str(formData.preferredLocations),
    str(entry.userId), skills.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  return {
    key: str(entry.id) || str(entry.uniqueId) || `${str(entry.userId)}-${index}` || `profile-${index}`,
    id: str(entry.id),
    userId: str(entry.userId) || str(formData.userId),
    name,
    email,
    phone,
    location,
    jobTitles,
    skills,
    workAuth,
    jobMatch,
    applied: entry.appliedStatus === true,
    applicationDate: str(entry.applicationDate) || null,
    followUpDate: str(entry.followUpDate) || null,
    submittedAt: str(entry.submittedAt) || null,
    agreementSigned: entry.agreementSigned === true || formData.agreementSigned === true,
    signatureImage,
    groups: buildGroups(formData),
    searchText,
    formData,
    raw: entry,
  };
}

/** Normalize already-parsed entries (e.g. rows loaded from Supabase). */
export function normalizeImportedEntries(entries: unknown[]): ImportedProfile[] {
  const profiles: ImportedProfile[] = [];
  entries.forEach((entry, index) => {
    if (isDict(entry)) {
      try {
        profiles.push(normalizeEntry(entry, index));
      } catch {
        /* skip malformed entry */
      }
    }
  });
  return profiles;
}

export function parseImportedProfiles(rawText: string): ParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) return { profiles: [], errors: ['No data provided.'] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    return { profiles: [], errors: [`Invalid JSON: ${err instanceof Error ? err.message : 'parse failed'}`] };
  }

  const list: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const profiles: ImportedProfile[] = [];
  const errors: string[] = [];

  list.forEach((entry, index) => {
    if (!isDict(entry)) {
      errors.push(`Entry ${index + 1} is not an object — skipped.`);
      return;
    }
    try {
      profiles.push(normalizeEntry(entry, index));
    } catch (err) {
      errors.push(`Entry ${index + 1} failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  });

  return { profiles, errors };
}

export function filterProfiles(
  profiles: ImportedProfile[],
  query: string,
  appliedOnly: boolean,
): ImportedProfile[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return profiles.filter((p) => {
    if (appliedOnly && !p.applied) return false;
    return tokens.every((t) => p.searchText.includes(t));
  });
}
