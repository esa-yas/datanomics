import { isJobMetadataLine, sanitizeBulletText } from '@/lib/resume/resumeLines';

export interface ResumeStructure {
  sectionHeadings: string[];
  skillCategories: string[];
  skillLines: string[];
  jobMetadataLines: string[];
  headerLines: string[];
  experienceJobCount: number;
  lineCount: number;
}

const SECTION_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|TECHNICAL SKILLS|CORE DATA & ANALYTICS SKILLS|CORE COMPETENCIES|SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EDUCATION|EDUCATION & CERTIFICATIONS|CERTIFICATIONS|PROJECTS|AWARDS)$/i;
const SECTION_KEYWORD_RE =
  /\b(SUMMARY|SKILLS?|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS?|PROJECTS?|AWARDS?|COMPETENCIES|QUALIFICATIONS|PROFILE|OBJECTIVE)\b/i;

export function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (SECTION_RE.test(t)) return true;
  return (
    t === t.toUpperCase() &&
    /[A-Z]/.test(t) &&
    SECTION_KEYWORD_RE.test(t) &&
    !t.includes('@') &&
    !t.includes('|')
  );
}

/** True for any uploaded resume's skills section heading (not a category line). */
export function isSkillsSectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 80) return false;
  if (
    /^(CORE DATA|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|PROFESSIONAL SKILLS|AREAS OF EXPERTISE|KEY QUALIFICATIONS)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (SECTION_RE.test(t) && /\b(SKILLS|COMPETENCIES|EXPERTISE)\b/i.test(t)) return true;
  if (/\b(SKILLS|COMPETENCIES|EXPERTISE)\b/i.test(t) && t === t.toUpperCase() && /[A-Z]/.test(t)) {
    return true;
  }
  return false;
}

/** The skills section heading from an uploaded resume, if present. */
export function getSkillsSectionHeading(text: string): string | null {
  const block = findSkillsBlock(text);
  if (!block) return null;
  return text.split('\n')[block.headingIndex]?.trim() ?? null;
}

export function isSkillCategoryLine(text: string): boolean {
  const t = sanitizeBulletText(text);
  return /^[A-Za-z][A-Za-z0-9\s&/+\-]{1,55}:\s*.+/.test(t);
}

export function skillCategoryName(text: string): string | null {
  const m = sanitizeBulletText(text).match(/^([^:]+):/);
  return m ? m[1].trim() : null;
}

const JOB_TITLE_WORD =
  /\b(Analyst|Engineer|Developer|Consultant|Manager|Director|Specialist|Architect|Administrator|Lead|Intern|Coordinator|Scientist|Designer|Strategist|Officer|Associate|Advisor|Head)\b/i;

const SENIORITY_WORD = /\b(Senior|Sr|Junior|Jr|Lead|Principal|Staff|Chief|Head|Entry|Mid)\b/i;

export function isLikelyJobTitleLine(text: string): boolean {
  const t = sanitizeBulletText(text);
  if (!t || t.includes(':') || isJobMetadataLine(t)) return false;
  if (t.length > 90) return false;
  return JOB_TITLE_WORD.test(t);
}

/** A line that looks like a person name — not contact, title, or summary. */
export function isPlausibleCandidateName(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (isHeaderContactLine(t)) return false;
  if (isMultiTitleHeadline(t)) return false;
  if (isLikelyJobTitleLine(t)) return false;
  if (t.includes('@')) return false;
  if (/\(\d{3}\)/.test(t) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t)) return false;
  if (/linkedin\.com/i.test(t)) return false;
  if (t.includes('|') && JOB_TITLE_WORD.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 6) return false;
  if (t.length > 55 && words.length > 4) return false;
  if (t.split(/[.!?]/).length > 2) return false;
  return true;
}

/**
 * Detects a line that is ONLY a job title (e.g. "Senior Business Intelligence Analyst").
 * Used to block a JD title from being inserted as a skill category or bullet.
 */
export function isJobTitleOnly(text: string): boolean {
  const t = sanitizeBulletText(text);
  if (!t || t.includes(':') || t.includes('|') || t.includes('@')) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if (!JOB_TITLE_WORD.test(t)) return false;
  // No verbs / sentence punctuation → it's a title, not a bullet
  if (/[.;,]/.test(t)) return false;
  if (/\b(led|built|delivered|developed|designed|created|automated|optimized|drove|managed|implemented|analyzed|reduced|increased|improved|supported|partnered|using|with|for|to)\b/i.test(t)) {
    return false;
  }
  const titleCaseRatio =
    words.filter((w) => /^[A-Z]/.test(w) || SENIORITY_WORD.test(w)).length / words.length;
  return titleCaseRatio >= 0.6;
}

export function parseResumeStructure(text: string): ResumeStructure {
  const lines = text.split('\n');
  const sectionHeadings: string[] = [];
  const skillCategories: string[] = [];
  const skillLines: string[] = [];
  const jobMetadataLines: string[] = [];
  const headerLines: string[] = [];
  let inSkills = false;
  let inExperience = false;
  let headerEnded = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;

    if (isSectionHeading(t)) {
      sectionHeadings.push(t);
      inSkills = isSkillsSectionHeading(t);
      inExperience = /EXPERIENCE|EMPLOYMENT/i.test(t);
      headerEnded = true;
      continue;
    }

    if (!headerEnded) {
      headerLines.push(t);
      continue;
    }

    if (inSkills && isSkillCategoryLine(t)) {
      skillLines.push(t);
      const cat = skillCategoryName(t);
      if (cat) skillCategories.push(cat);
      continue;
    }

    if (isJobMetadataLine(t)) {
      jobMetadataLines.push(t);
      inSkills = false;
      continue;
    }

    if (inExperience) inSkills = false;
  }

  return {
    sectionHeadings,
    skillCategories,
    skillLines,
    jobMetadataLines,
    headerLines,
    experienceJobCount: jobMetadataLines.length,
    lineCount: lines.filter((l) => l.trim()).length,
  };
}

/** Terms/tools mentioned in the resume — used to block invented skills. */
export function extractResumeVocabulary(text: string): Set<string> {
  const vocab = new Set<string>();
  const add = (s: string) => {
    const t = s.toLowerCase().trim();
    if (t.length >= 2) vocab.add(t);
  };

  for (const line of text.split('\n')) {
    const t = sanitizeBulletText(line);
    if (!t) continue;
    if (isSkillCategoryLine(t)) {
      const after = t.split(':').slice(1).join(':');
      for (const part of after.split(/[,|·•/]/)) add(part);
    }
    for (const word of t.match(/\b[A-Za-z][A-Za-z0-9+#.\-]{1,24}\b/g) ?? []) {
      add(word);
    }
  }

  return vocab;
}

/** Map each non-metadata line to job index (0 = most recent) for edit limits. */
export function lineToJobIndex(text: string, lineText: string): number | null {
  const lines = text.split('\n');
  const target = normalizeLine(lineText);
  let jobIdx = -1;
  let inExp = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (/^(PROFESSIONAL )?EXPERIENCE|WORK EXPERIENCE$/i.test(t)) {
      inExp = true;
      continue;
    }
    if (inExp && isSectionHeading(t) && !/EXPERIENCE/i.test(t)) break;
    if (inExp && isJobMetadataLine(t)) {
      jobIdx++;
      continue;
    }
    if (inExp && normalizeLine(t) === target) return jobIdx >= 0 ? jobIdx : null;
  }
  return null;
}

export function normalizeLine(line: string): string {
  return sanitizeBulletText(line).replace(/\s+/g, ' ').trim().toLowerCase();
}

export type LineRegion =
  | 'header'
  | 'summary'
  | 'skills'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'other';

/** Which resume region contains this exact line (first match). */
export function getLineRegion(text: string, targetLine: string): LineRegion | null {
  const targetNorm = normalizeLine(targetLine);
  const lines = text.split('\n');
  let region: LineRegion = 'header';

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (isSectionHeading(t)) {
      if (/^CERTIFICATION/i.test(t)) region = 'certifications';
      else if (/^EDUCATION/i.test(t)) region = 'education';
      else if (isSkillsSectionHeading(t)) region = 'skills';
      else if (/EXPERIENCE|EMPLOYMENT/i.test(t)) region = 'experience';
      else if (/SUMMARY/i.test(t)) region = 'summary';
      else region = 'other';
      continue;
    }
    if (normalizeLine(t) === targetNorm) return region;
  }
  return null;
}

export function isProtectedTitleRegion(region: LineRegion | null): boolean {
  return (
    region === 'education' ||
    region === 'certifications' ||
    region === 'skills' ||
    region === 'summary'
  );
}

export function originalContainsLine(originalText: string, line: string): boolean {
  const norm = normalizeLine(line);
  return originalText.split('\n').some((l) => normalizeLine(l) === norm);
}

export function sectionOrderIntact(original: string, tailored: string): boolean {
  const a = parseResumeStructure(original).sectionHeadings.map((h) => h.toUpperCase());
  const b = parseResumeStructure(tailored).sectionHeadings.map((h) => h.toUpperCase());
  if (a.length !== b.length) return false;
  return a.every((h, i) => h === b[i]);
}

export interface SkillsBlock {
  headingIndex: number;
  startIndex: number;
  endIndex: number;
  lines: string[];
}

/** Locate the skills section region [startIndex, endIndex) within text lines. */
export function findSkillsBlock(text: string): SkillsBlock | null {
  const lines = text.split('\n');
  let headingIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (isSkillsSectionHeading(t)) {
      headingIndex = i;
      break;
    }
  }
  if (headingIndex === -1) return null;

  let end = headingIndex + 1;
  while (end < lines.length) {
    const t = lines[end].trim();
    if (t && isSectionHeading(t) && !isSkillsSectionHeading(t)) break;
    if (t && isJobMetadataLine(t)) break;
    end++;
  }

  return {
    headingIndex,
    startIndex: headingIndex + 1,
    endIndex: end,
    lines: lines.slice(headingIndex + 1, end),
  };
}

function skillTokens(line: string): string[] {
  const after = sanitizeBulletText(line).split(':').slice(1).join(':');
  return after
    .split(/[,|·•/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Guarantees the tailored Technical Skills section keeps the original category labels
 * and order. Keeps AI keyword additions only when the category label matches AND all
 * original tokens are still present. Removes any injected JD-title / non-category line.
 */
export function repairSkillsSection(originalText: string, tailoredText: string): string {
  const orig = findSkillsBlock(originalText);
  if (!orig) return tailoredText;

  const origCategoryLines = orig.lines.filter((l) => isSkillCategoryLine(l));
  if (origCategoryLines.length === 0) return tailoredText;

  const tail = findSkillsBlock(tailoredText);
  if (!tail) return tailoredText;

  // Map tailored skill lines by category label (first occurrence wins).
  const tailoredByCategory = new Map<string, string>();
  for (const line of tail.lines) {
    if (!isSkillCategoryLine(line)) continue;
    const cat = skillCategoryName(line)?.toLowerCase();
    if (cat && !tailoredByCategory.has(cat)) tailoredByCategory.set(cat, line);
  }

  const repaired: string[] = [];
  for (const origLine of orig.lines) {
    if (!isSkillCategoryLine(origLine)) {
      repaired.push(origLine);
      continue;
    }
    const cat = skillCategoryName(origLine)!.toLowerCase();
    const tailoredLine = tailoredByCategory.get(cat);

    if (
      tailoredLine &&
      !isJobTitleOnly(tailoredLine) &&
      skillCategoryName(tailoredLine)?.toLowerCase() === cat
    ) {
      const origTokens = skillTokens(origLine).map((t) => t.toLowerCase());
      const tailoredLower = tailoredLine.toLowerCase();
      const keepsAllOriginalTokens = origTokens.every((t) => tailoredLower.includes(t));
      repaired.push(keepsAllOriginalTokens ? tailoredLine : origLine);
    } else {
      // Missing category, JD title, or renamed label → restore original line.
      repaired.push(origLine);
    }
  }

  const tLines = tailoredText.split('\n');
  return [
    ...tLines.slice(0, tail.startIndex),
    ...repaired,
    ...tLines.slice(tail.endIndex),
  ].join('\n');
}

/** True when every original skill category label still exists in the tailored text. */
export function skillCategoriesPreserved(originalText: string, tailoredText: string): boolean {
  const orig = parseResumeStructure(originalText).skillCategories;
  if (orig.length === 0) return true;
  const tail = parseResumeStructure(tailoredText).skillCategories.map((c) => c.toLowerCase());
  return orig.every((c) => tail.includes(c.toLowerCase()));
}

/** True when no JD-title line leaked into the Technical Skills section. */
export function noJobTitleInSkills(tailoredText: string): boolean {
  const block = findSkillsBlock(tailoredText);
  if (!block) return true;
  return !block.lines.some((l) => l.trim() && isJobTitleOnly(l));
}

/**
 * Detects a pipe-joined headline like "Analytics Engineer | Senior Data Analyst | Power BI Developer".
 * These are resume headlines / target roles and must never appear as an experience bullet.
 */
export function isMultiTitleHeadline(text: string): boolean {
  const t = sanitizeBulletText(text);
  if (!t.includes('|')) return false;
  if (t.includes('@') || isJobMetadataLine(t)) return false; // contact or company/date line
  if (/[.;]/.test(t)) return false; // sentence punctuation → it's a real bullet
  const segments = t.split('|').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return false;
  const titleSegments = segments.filter((s) => {
    const words = s.split(/\s+/).filter(Boolean);
    return words.length > 0 && words.length <= 5 && JOB_TITLE_WORD.test(s);
  });
  return titleSegments.length >= 2;
}

/** True if a line is a headline/target-role that doesn't belong in an experience bullet. */
export function isHeadlineOrTitleLine(text: string): boolean {
  return isMultiTitleHeadline(text) || isJobTitleOnly(text);
}

/** Contact / link lines in the header — not the resume headline. */
export function isHeaderContactLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (t.includes('@')) return true;
  if (/\(\d{3}\)/.test(t)) return true;
  if (/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t)) return true;
  if (/linkedin\.com/i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  // "phone | email | linkedin" or "location | email | phone" style contact row
  if (t.includes('|') && (t.includes('@') || /\(\d{3}\)/.test(t) || /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(t))) {
    return true;
  }
  return false;
}

export interface HeaderRegion {
  nameIdx: number;
  headlineIdx: number | null;
  contactIdx: number | null;
  /** True when the contact row appears above the title row in the source resume. */
  contactBeforeTitle: boolean;
}

/** Detect name, title, and contact rows in the header before the first section heading. */
export function parseHeaderRegion(text: string): HeaderRegion | null {
  const lines = text.split('\n');
  const headerIndices: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    headerIndices.push(i);
  }

  if (!headerIndices.length) return null;

  let nameIdx = -1;
  for (const i of headerIndices) {
    const t = lines[i].trim();
    if (isPlausibleCandidateName(t)) {
      nameIdx = i;
      break;
    }
  }
  if (nameIdx === -1) {
    const first = lines[headerIndices[0]].trim();
    if (
      !isHeaderContactLine(first) &&
      !isMultiTitleHeadline(first) &&
      !isLikelyJobTitleLine(first)
    ) {
      nameIdx = headerIndices[0];
    } else {
      return null;
    }
  }

  const headerLineIndices = headerIndices.filter((i) => i !== nameIdx);

  let headlineIdx: number | null = null;
  let contactIdx: number | null = null;

  for (const i of headerLineIndices) {
    const t = lines[i].trim();
    if (isHeaderContactLine(t)) {
      if (contactIdx === null) contactIdx = i;
      continue;
    }
    if (isMultiTitleHeadline(t)) {
      if (headlineIdx === null) headlineIdx = i;
    }
  }

  if (headlineIdx === null) {
    for (const i of headerLineIndices) {
      if (i === contactIdx) continue;
      const t = lines[i].trim();
      if (isHeaderContactLine(t) || isJobMetadataLine(t)) continue;
      if (t.includes('|') || isLikelyJobTitleLine(t) || isJobTitleOnly(t)) {
        headlineIdx = i;
        break;
      }
    }
  }

  if (contactIdx === null) {
    for (const i of headerLineIndices) {
      if (isHeaderContactLine(lines[i].trim())) {
        contactIdx = i;
        break;
      }
    }
  }

  const contactBeforeTitle =
    contactIdx !== null && headlineIdx !== null && contactIdx < headlineIdx;

  return { nameIdx, headlineIdx, contactIdx, contactBeforeTitle };
}

/**
 * Index of the resume headline in the header region.
 * Supports both layouts:
 *   Name → Title → Contact
 *   Name → Contact → Title
 */
export function findHeadlineLineIndex(text: string): number | null {
  return parseHeaderRegion(text)?.headlineIdx ?? null;
}

/** The candidate's headline from the header region (before the first section heading), if any. */
export function getResumeHeadline(text: string): string | null {
  const idx = findHeadlineLineIndex(text);
  if (idx === null) return null;
  return text.split('\n')[idx]?.trim() || null;
}

function originalLineSet(originalText: string): Set<string> {
  return new Set(originalText.split('\n').map(normalizeLine).filter(Boolean));
}

/**
 * A body line is a STRAY title/headline (injected, not real content) when, after the
 * first section heading, it is:
 *  - a pipe-joined headline ("Title | Title | Title"), or
 *  - a duplicate of the resume headline, or
 *  - a standalone job title (e.g. the JD title "Senior Salesforce Data Analyst") that does
 *    NOT exist anywhere in the original resume.
 * Real job-title lines from the original (e.g. role headings under a company) are kept,
 * because they appear in the original text.
 */
function experienceRoleTitleNorms(originalText: string): Set<string> {
  return new Set(extractExperienceRoleTitleLines(originalText).map(normalizeLine));
}

function isStrayBodyTitle(
  line: string,
  headlineNorm: string | null,
  origLines: Set<string>,
  forbiddenNorms: Set<string>,
  origEduCertNorms: Set<string>,
  originalText: string,
): boolean {
  const t = line.trim();
  if (!t) return false;
  const norm = normalizeLine(t);
  if (origEduCertNorms.has(norm)) return false;
  if (experienceRoleTitleNorms(originalText).has(norm)) return false;
  if (forbiddenNorms.has(norm)) return true;
  if (isMultiTitleHeadline(t)) return true;
  if (headlineNorm && norm === headlineNorm) return true;
  if (isJobTitleOnly(t) && !origLines.has(norm)) return true;
  return false;
}

/**
 * Removes stray headline / target-role lines that leaked into the body (anything after the
 * first section heading). Real job titles and real bullets are left untouched.
 */
export function removeStrayTitleLines(
  originalText: string,
  tailoredText: string,
  extraForbiddenNorms: string[] = [],
): string {
  const headline = getResumeHeadline(originalText);
  const headlineNorm = headline ? normalizeLine(headline) : null;
  const origLines = originalLineSet(originalText);
  const origEduCertNorms = new Set(
    sectionLines(originalText, /EDUCATION|CERTIFICATION/i).map(normalizeLine),
  );
  const forbiddenNorms = new Set(extraForbiddenNorms.map(normalizeLine).filter(Boolean));

  const lines = tailoredText.split('\n');
  const out: string[] = [];
  let pastFirstHeading = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (isSectionHeading(t)) {
      pastFirstHeading = true;
      out.push(raw);
      continue;
    }
    if (
      pastFirstHeading &&
      isStrayBodyTitle(t, headlineNorm, origLines, forbiddenNorms, origEduCertNorms, originalText)
    ) {
      continue;
    }
    out.push(raw);
  }

  return out.join('\n');
}

/** True when no headline / target-role line leaked into the body sections. */
export function noStrayTitleInExperience(originalText: string, tailoredText: string): boolean {
  const headline = getResumeHeadline(originalText);
  const headlineNorm = headline ? normalizeLine(headline) : null;
  const origLines = originalLineSet(originalText);
  const origEduCertNorms = new Set(
    sectionLines(originalText, /EDUCATION|CERTIFICATION/i).map(normalizeLine),
  );

  const lines = tailoredText.split('\n');
  let pastFirstHeading = false;

  for (const raw of lines) {
    const t = raw.trim();
    if (isSectionHeading(t)) {
      pastFirstHeading = true;
      continue;
    }
    if (
      pastFirstHeading &&
      isStrayBodyTitle(t, headlineNorm, origLines, new Set(), origEduCertNorms, originalText)
    ) {
      return false;
    }
  }
  return true;
}

/** Best-effort extraction of the target JD title (first title-like line near the top). */
export function extractJdTitle(jdText: string): string | null {
  const lines = jdText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 12)) {
    const cleaned = line.replace(/^(job title|title|position|role)\s*[:\-]\s*/i, '').trim();
    if (cleaned.length >= 3 && cleaned.length <= 70 && JOB_TITLE_WORD.test(cleaned) && !cleaned.includes('@')) {
      return cleaned;
    }
  }
  return lines[0] && lines[0].length <= 70 ? lines[0] : null;
}

const EXPERIENCE_HEADING_RE = /^(PROFESSIONAL )?EXPERIENCE|WORK EXPERIENCE$/i;
const BODY_BULLET_START_RE = /^[•*●▪◦‣▸►\-–]\s*/;

/**
 * Role title lines in PROFESSIONAL EXPERIENCE — the standalone job title immediately
 * above each company | location | date metadata line (e.g. "Senior Financial Data Analyst").
 */
export function extractExperienceRoleTitleLines(originalText: string): string[] {
  const lines = originalText.split('\n');
  const out: string[] = [];
  let inExp = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) continue;

    if (EXPERIENCE_HEADING_RE.test(t)) {
      inExp = true;
      continue;
    }
    if (inExp && isSectionHeading(t) && !/EXPERIENCE/i.test(t)) break;
    if (!inExp) continue;
    if (isJobMetadataLine(t)) continue;
    if (BODY_BULLET_START_RE.test(raw.trim())) continue;

    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    if (j < lines.length && isJobMetadataLine(lines[j].trim())) {
      out.push(t);
    }
  }

  return out;
}

export function lineInOriginalExperienceSection(originalText: string, line: string): boolean {
  const norm = normalizeLine(line);
  const lines = originalText.split('\n');
  let inExp = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (EXPERIENCE_HEADING_RE.test(t)) {
      inExp = true;
      continue;
    }
    if (inExp && isSectionHeading(t) && !/EXPERIENCE/i.test(t)) break;
    if (inExp && normalizeLine(t) === norm) return true;
  }
  return false;
}

function metadataLineAfterRoleTitleForText(originalText: string, roleTitle: string): string | null {
  const lines = originalText.split('\n');
  const norm = normalizeLine(roleTitle);
  for (let i = 0; i < lines.length; i++) {
    if (normalizeLine(lines[i].trim()) !== norm) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const meta = lines[j]?.trim() ?? '';
    return isJobMetadataLine(meta) ? meta : null;
  }
  return null;
}

/** Re-insert experience role titles dropped from tailored body text. */
export function appendMissingExperienceRoleTitles(bodyText: string, originalText: string): string {
  const required = extractExperienceRoleTitleLines(originalText);
  if (!required.length) return bodyText;

  const lines = bodyText.split('\n');
  const present = new Set(lines.map((l) => normalizeLine(l.trim())).filter(Boolean));
  const insertions: Array<{ at: number; line: string }> = [];

  for (const title of required) {
    if (present.has(normalizeLine(title))) continue;
    const meta = metadataLineAfterRoleTitleForText(originalText, title);
    if (!meta) continue;
    const bodyMetaIdx = lines.findIndex((l) => normalizeLine(l.trim()) === normalizeLine(meta));
    if (bodyMetaIdx >= 0) insertions.push({ at: bodyMetaIdx, line: title });
  }

  insertions.sort((a, b) => b.at - a.at);
  for (const { at, line } of insertions) {
    lines.splice(at, 0, line);
  }
  return lines.join('\n');
}

/** Lines belonging to a given section heading region (until the next section heading). */
export function sectionLines(text: string, headingMatcher: RegExp): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let inSection = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (isSectionHeading(t)) {
      inSection = headingMatcher.test(t);
      continue;
    }
    if (inSection && t) out.push(t);
  }
  return out;
}

/** True when every original Education / Certification line still exists in the tailored text. */
export function educationAndCertsPreserved(originalText: string, tailoredText: string): boolean {
  const matcher = /EDUCATION|CERTIFICATION/i;
  const origLines = sectionLines(originalText, matcher).map(normalizeLine);
  if (origLines.length === 0) return true;
  const tailoredSet = new Set(tailoredText.split('\n').map(normalizeLine));
  return origLines.every((l) => tailoredSet.has(l));
}

/** Re-insert education/certification lines removed during tailoring. */
export function restoreEducationAndCertLines(originalText: string, tailoredText: string): string {
  const matcher = /EDUCATION|CERTIFICATION/i;
  const origLines = sectionLines(originalText, matcher);
  if (!origLines.length) return tailoredText;

  let result = tailoredText;
  const present = () => new Set(result.split('\n').map(normalizeLine));

  for (const line of origLines) {
    if (present().has(normalizeLine(line))) continue;

    const lines = result.split('\n');
    let insertAt = -1;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (!isSectionHeading(t) || !matcher.test(t)) continue;
      insertAt = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        const u = lines[j].trim();
        if (u && isSectionHeading(u) && !matcher.test(u)) {
          insertAt = j;
          break;
        }
        insertAt = j + 1;
      }
      break;
    }

    if (insertAt >= 0) {
      lines.splice(insertAt, 0, line);
      result = lines.join('\n');
    }
  }

  return result;
}
