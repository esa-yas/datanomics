import { sanitizeBulletText } from '@/lib/resume/resumeLines';
import {
  findHeadlineLineIndex,
  getResumeHeadline,
  normalizeLine,
  parseHeaderRegion,
} from '@/lib/resume/resumeStructure';

const JOB_TITLE_WORD =
  /\b(Analyst|Engineer|Developer|Consultant|Manager|Director|Specialist|Architect|Administrator|Lead|Intern|Coordinator|Scientist|Designer|Strategist|Officer|Associate|Advisor|Head|Developer)\b/i;

const SECTION_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|TECHNICAL SKILLS|CORE DATA|SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS|AWARDS)$/i;
const SECTION_KEYWORD_RE =
  /\b(SUMMARY|SKILLS?|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS?|PROJECTS?|AWARDS?|COMPETENCIES|QUALIFICATIONS|PROFILE|OBJECTIVE)\b/i;

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  if (SECTION_RE.test(t)) return true;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && SECTION_KEYWORD_RE.test(t) && !t.includes('@');
}

/** City/state or work-mode segment — not a role title. */
export function isLocationSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s) return false;
  if (JOB_TITLE_WORD.test(s)) return false;
  if (/^(Remote|Hybrid|On-site|Onsite|Relocation|Open to Relocate)$/i.test(s)) return true;
  // "Washington, DC" / "New York, NY"
  if (/^[A-Za-z][A-Za-z\s.'-]+,\s*[A-Z]{2}\b/.test(s)) return true;
  if (/^[A-Za-z][A-Za-z\s.'-]{2,30}\s+(DC|NY|CA|TX|VA|MD|GA|FL|IL|PA|MA|WA|CO|AZ|NC|NJ|OH|MI)\b/i.test(s)) return true;
  return false;
}

export interface HeadlineParts {
  roles: string[];
  location: string | null;
}

export function parseHeadlineSegments(headline: string): HeadlineParts {
  const segments = headline.split('|').map((s) => s.trim()).filter(Boolean);
  const roles: string[] = [];
  let location: string | null = null;
  for (const seg of segments) {
    if (isLocationSegment(seg)) location = seg;
    else roles.push(seg);
  }
  return { roles, location };
}

export interface ContactParts {
  location: string | null;
  phone: string | null;
  email: string | null;
  linkedin: string | null;
}

export function parseContactSegments(line: string): ContactParts {
  const segments = line.split('|').map((s) => s.trim()).filter(Boolean);
  const parts: ContactParts = { location: null, phone: null, email: null, linkedin: null };
  for (const seg of segments) {
    if (seg.includes('@') && !parts.email) parts.email = seg;
    else if (/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(seg) && !parts.phone) parts.phone = seg;
    else if (/linkedin\.com/i.test(seg) && !parts.linkedin) parts.linkedin = seg;
    else if (isLocationSegment(seg) && !parts.location) parts.location = seg;
  }
  return parts;
}

/** Scan the full header region for a city/state or location segment. */
export function extractHeaderLocation(text: string): string | null {
  const lines = text.split('\n');
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    for (const seg of t.split('|').map((s) => s.trim()).filter(Boolean)) {
      if (isLocationSegment(seg)) return seg;
    }
  }
  return null;
}

/** Contact row anywhere in the header region (before first section heading). */
export function findHeaderContactLineIndex(text: string): number | null {
  return parseHeaderRegion(text)?.contactIdx ?? null;
}

export interface FormattedHeaderUpdate {
  headlineLine: string;
  /** Set only when contact must change (e.g. location moved off title). Null = leave contact untouched. */
  contactLine: string | null;
  headlineIdx: number;
  contactIdx: number | null;
  contactBeforeTitle: boolean;
}

export type HeaderLineRole = 'name' | 'title' | 'contact';

/** Detected header layout from the original resume (before first section heading). */
export interface HeaderPattern {
  nameLine: string;
  titleLine: string | null;
  contactLine: string | null;
  /** Display order in the original header, e.g. ['name','title','contact'] or ['name','contact','title']. */
  lineOrder: HeaderLineRole[];
  contactBeforeTitle: boolean;
  /** Non-empty lines in the original header block (including name). */
  originalLineCount: number;
}

/**
 * Parse the original resume header and detect line roles + order.
 * Supports:
 *   Pattern A: name → title → contact
 *   Pattern B: name → contact → title
 *   Pattern C: name → title+location → contact   (location merged into title line)
 *
 * IMPORTANT: This function must always receive the TRUE original uploaded resume text,
 * not a tailored/fallback copy. Callers must guarantee immutability of originalText.
 */
export function detectHeaderPattern(text: string): HeaderPattern | null {
  const header = parseHeaderRegion(text);
  if (!header) return null;

  const lines = text.split('\n');
  const nameLine = lines[header.nameIdx]?.trim() ?? '';
  if (!nameLine) return null;

  const titleLine = header.headlineIdx != null ? lines[header.headlineIdx]?.trim() ?? null : null;
  const contactLine = header.contactIdx != null ? lines[header.contactIdx]?.trim() ?? null : null;

  const lineOrder: HeaderLineRole[] = ['name'];
  const roleEntries: Array<{ role: HeaderLineRole; idx: number }> = [];
  if (header.headlineIdx != null) roleEntries.push({ role: 'title', idx: header.headlineIdx });
  if (header.contactIdx != null) roleEntries.push({ role: 'contact', idx: header.contactIdx });
  roleEntries.sort((a, b) => a.idx - b.idx);
  for (const { role } of roleEntries) lineOrder.push(role);

  let originalLineCount = 1;
  for (let i = header.nameIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    originalLineCount++;
  }

  return {
    nameLine,
    titleLine,
    contactLine,
    lineOrder,
    contactBeforeTitle: header.contactBeforeTitle,
    originalLineCount,
  };
}

/**
 * Build the expected header block preserving the original line order.
 *
 * Bug fix: Previously, when titleLine had a location embedded (Pattern C), the location
 * was lost from the new contactLine because buildFormattedHeaderUpdate only migrated
 * location to the contact row when locOnTitle was truthy AND a contact row existed.
 * Now we always ensure the contact row has the location if the original had it anywhere.
 *
 * MUST be called with the immutable originalText (from file upload), never the tailored copy.
 */
export function buildExpectedDocxHeaderLines(
  originalText: string,
  suggestedTitle?: string,
): string[] {
  const pattern = detectHeaderPattern(originalText);
  if (!pattern) return [];

  let titleLine = pattern.titleLine ?? '';
  let contactLine = pattern.contactLine ?? '';

  if (suggestedTitle?.trim()) {
    const newTitle = formattedHeadlineLine(originalText, suggestedTitle);
    if (newTitle) titleLine = newTitle;

    const update = buildFormattedHeaderUpdate(originalText, suggestedTitle);
    // update.contactLine is set when location was on the old title and must move to contact
    if (update?.contactLine) contactLine = update.contactLine;
  }

  // Always ensure location appears in the contact row if it exists somewhere in the header
  // and the contact row doesn't already have it. This handles Pattern C correctly.
  const location = extractHeaderLocation(originalText);
  if (location && contactLine) {
    const contactParts = parseContactSegments(contactLine);
    if (!contactParts.location) {
      contactLine = `${location} | ${contactLine}`;
    }
  }

  const byRole: Record<HeaderLineRole, string> = {
    name: pattern.nameLine,
    title: titleLine,
    contact: contactLine,
  };

  return pattern.lineOrder.map((role) => byRole[role]).filter((line) => line.trim());
}

/** Insert location into a contact line without reordering existing segments. */
function insertLocationIntoContactLine(
  originalContact: string,
  location: string,
): string {
  const segments = originalContact.split('|').map((s) => s.trim()).filter(Boolean);
  if (segments.some((s) => isLocationSegment(s))) return originalContact;
  return `${location} | ${originalContact}`;
}

/**
 * Build a title-line update that preserves the uploaded resume's header layout.
 * Only the role/title line changes; contact order and placement stay as-is unless
 * location must move off an old title line onto an existing contact row.
 *
 * Pattern C fix: when the original title line embeds a location (e.g.
 * "Senior Data Analyst | Power BI Developer | Washington, DC"), the new title must
 * strip the location, and if there is a separate contact row, inject location there.
 */
export function buildFormattedHeaderUpdate(
  text: string,
  suggestedTitle: string,
): FormattedHeaderUpdate | null {
  const header = parseHeaderRegion(text);
  const headlineIdx = header?.headlineIdx ?? findHeadlineLineIndex(text);
  if (headlineIdx === null) return null;

  const lines = text.split('\n');
  const originalHeadline = lines[headlineIdx]?.trim() || '';
  const trimmed = sanitizeBulletText(suggestedTitle);
  if (!trimmed) return null;

  const { roles: origRoles, location: locOnTitle } = parseHeadlineSegments(originalHeadline);
  const { roles: suggestedRoles } = parseHeadlineSegments(trimmed);

  // Build role titles: prefer suggested roles; supplement with original roles as needed
  let roleTitles = (suggestedRoles.length ? suggestedRoles : [trimmed]).filter(
    (r) => !isLocationSegment(r),
  );

  if (roleTitles.length >= 2) {
    roleTitles = roleTitles.slice(0, 3);
  } else if (roleTitles.length === 1 && origRoles.length > 0) {
    const primary = roleTitles[0];
    const extras = origRoles.filter((r) => normalizeLine(r) !== normalizeLine(primary));
    roleTitles = [primary, ...extras].slice(0, 3);
  }

  // The headline line contains ONLY roles — never location (that belongs on the contact row)
  let headlineLine = roleTitles.join(' | ');

  const contactIdx = header?.contactIdx ?? findHeaderContactLineIndex(text);

  // No separate contact row — preserve location on title line if original had it there (Pattern C edge case)
  if (contactIdx === null && locOnTitle) {
    headlineLine = `${headlineLine} | ${locOnTitle}`;
  }

  // If there IS a contact row and the original title had the location embedded,
  // move the location off the title and onto the contact row.
  let contactLine: string | null = null;
  if (contactIdx !== null && locOnTitle) {
    const originalContact = lines[contactIdx]?.trim() || '';
    const contactParts = parseContactSegments(originalContact);
    if (originalContact && !contactParts.location) {
      contactLine = insertLocationIntoContactLine(originalContact, locOnTitle);
    }
  }

  return {
    headlineLine,
    contactLine,
    headlineIdx,
    contactIdx,
    contactBeforeTitle: header?.contactBeforeTitle ?? false,
  };
}

/** Add missing location to contact row only — never reorder an existing contact line. */
export function ensureHeaderContactLocation(text: string, sourceText: string): string {
  const location = extractHeaderLocation(sourceText);
  if (!location) return text;

  const contactIdx = findHeaderContactLineIndex(text);
  if (contactIdx === null) return text;

  const lines = text.split('\n');
  const originalContact = lines[contactIdx]?.trim() || '';
  const parts = parseContactSegments(originalContact);
  if (parts.location) return text;

  const headlineIdx = findHeadlineLineIndex(text);
  if (headlineIdx !== null) {
    const { location: locOnTitle } = parseHeadlineSegments(lines[headlineIdx]?.trim() || '');
    if (locOnTitle) return text;
  }

  lines[contactIdx] = insertLocationIntoContactLine(originalContact, location);
  return lines.join('\n');
}

/** Apply suggested title — updates the title line only; contact row unchanged unless location migration is required. */
export function applyFormattedSuggestedTitle(text: string, suggestedTitle: string): string {
  const update = buildFormattedHeaderUpdate(text, suggestedTitle);
  if (!update) return text;

  const lines = text.split('\n');
  lines[update.headlineIdx] = update.headlineLine;

  if (update.contactLine && update.contactIdx !== null) {
    lines[update.contactIdx] = update.contactLine;
  }

  return lines.join('\n');
}

/** Insert a title line when the header has name/contact but no headline slot. */
export function insertTitleLineInHeader(
  text: string,
  sourceText: string,
  suggestedTitle: string,
): string {
  const headlineLine =
    formattedHeadlineLine(sourceText, suggestedTitle) ??
    formattedHeadlineLine(text, suggestedTitle) ??
    sanitizeBulletText(suggestedTitle);
  if (!headlineLine) return text;

  const header = parseHeaderRegion(text) ?? parseHeaderRegion(sourceText);
  const lines = text.split('\n');
  let insertAt = header?.nameIdx != null ? header.nameIdx + 1 : 0;

  if (header?.contactIdx != null) {
    insertAt = header.contactBeforeTitle ? header.contactIdx + 1 : header.contactIdx;
  }

  for (let i = insertAt; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^(PROFESSIONAL SUMMARY|SUMMARY|TECHNICAL SKILLS|CORE DATA|SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS)/i.test(t)) {
      insertAt = i;
      break;
    }
    if (i > (header?.nameIdx ?? 0)) break;
  }

  lines.splice(insertAt, 0, headlineLine);
  return lines.join('\n');
}

/** Re-apply title and contact/location after body cleanup — never leaves header without a title line. */
export function ensureHeaderTitleAndContact(
  sourceText: string,
  text: string,
  suggestedTitle?: string,
): string {
  let out = text;
  if (suggestedTitle?.trim()) {
    const before = out;
    out = applyFormattedSuggestedTitle(out, suggestedTitle);
    if (out === before) {
      out = insertTitleLineInHeader(out, sourceText, suggestedTitle);
    }
  }
  return ensureHeaderContactLocation(out, sourceText);
}

/** Headline line that will actually be written (roles only unless original kept location on title). */
export function formattedHeadlineLine(text: string, suggestedTitle: string): string | null {
  return buildFormattedHeaderUpdate(text, suggestedTitle)?.headlineLine ?? null;
}

/** DOCX/text patches for contact — only when location moves off the title line. */
export function getContactLinePatches(
  originalText: string,
  suggestedTitle?: string,
): Array<{ original: string; tailored: string }> {
  if (!suggestedTitle?.trim()) return [];

  const update = buildFormattedHeaderUpdate(originalText, suggestedTitle);
  if (!update?.contactLine || update.contactIdx === null) return [];

  const lines = originalText.split('\n');
  const originalContact = lines[update.contactIdx]?.trim() || '';
  if (!originalContact || originalContact === update.contactLine) return [];

  return [{ original: originalContact, tailored: update.contactLine }];
}

/** For DOCX patching — original headline text and formatted replacement. */
export function headlinePatchPair(
  originalText: string,
  suggestedTitle: string,
): { original: string; tailored: string } | null {
  const original = getResumeHeadline(originalText);
  const tailored = formattedHeadlineLine(originalText, suggestedTitle);
  if (!original || !tailored || original === tailored) return null;
  return { original, tailored };
}

/** For DOCX patching — contact line update when location moves off the title line. */
export function contactPatchPair(
  originalText: string,
  suggestedTitle: string,
): { original: string; tailored: string } | null {
  return getContactLinePatches(originalText, suggestedTitle)[0] ?? null;
}

/** @deprecated Use getContactLinePatches */
export function contactLocationPatchPair(
  originalText: string,
): { original: string; tailored: string } | null {
  return getContactLinePatches(originalText)[0] ?? null;
}