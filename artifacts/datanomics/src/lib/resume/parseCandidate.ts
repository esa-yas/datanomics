export interface ParsedCandidateFields {
  full_name?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  target_roles?: string[];
  experience_years?: number;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

function looksLikeName(line: string): boolean {
  if (!line || line.length > 70) return false;
  if (line.includes('@') || /https?:\/\//i.test(line)) return false;
  if (/^(skills|experience|education|summary|objective|profile)/i.test(line)) return false;
  const words = line.split(/\s+/);
  return words.length >= 2 && words.length <= 5 && words.every((w) => /^[A-Za-z'.-]+$/.test(w));
}

function extractSectionList(text: string, headings: string[]): string[] {
  const lower = text.toLowerCase();
  for (const heading of headings) {
    const idx = lower.indexOf(heading);
    if (idx === -1) continue;
    const after = text.slice(idx + heading.length).split(/\r?\n/);
    const items: string[] = [];
    for (const line of after.slice(0, 25)) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (items.length > 2) break;
        continue;
      }
      if (/^(experience|education|projects|certifications|work history|employment)/i.test(trimmed)) break;
      const parts = trimmed
        .replace(/^[-•*]\s*/, '')
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 1 && s.length < 40);
      items.push(...parts);
      if (items.length >= 12) break;
    }
    if (items.length) return [...new Set(items)].slice(0, 15);
  }
  return [];
}

function extractTargetRoles(lines: string[], fullName?: string): string[] {
  const roles: string[] = [];
  for (const line of lines.slice(0, 8)) {
    if (line === fullName) continue;
    if (line.length > 80) continue;
    if (/@|linkedin|github|phone/i.test(line)) continue;
    if (
      /\b(engineer|developer|analyst|manager|architect|consultant|designer|scientist|administrator|specialist|lead|director)\b/i.test(
        line,
      )
    ) {
      roles.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  return roles.slice(0, 3);
}

export function parseCandidateFromResumeText(text: string): ParsedCandidateFields {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = text.match(EMAIL_RE)?.[0];
  const phone = text.match(PHONE_RE)?.[0]?.trim();

  let full_name: string | undefined;
  if (email) {
    const emailLineIdx = lines.findIndex((l) => l.includes(email));
    for (let i = emailLineIdx - 1; i >= 0 && i >= emailLineIdx - 3; i--) {
      if (looksLikeName(lines[i])) {
        full_name = lines[i];
        break;
      }
    }
  }
  if (!full_name) {
    const first = lines.find((l) => looksLikeName(l));
    if (first) full_name = first;
  }

  const skills = extractSectionList(text, ['technical skills', 'core competencies', 'skills']);
  const target_roles = extractTargetRoles(lines, full_name);
  const expMatch = text.match(/(\d{1,2})\+?\s*(?:years?|yrs?)(?:\s+of)?\s+(?:experience|exp)/i);

  return {
    full_name,
    email,
    phone,
    skills,
    target_roles,
    experience_years: expMatch ? parseInt(expMatch[1], 10) : undefined,
  };
}
