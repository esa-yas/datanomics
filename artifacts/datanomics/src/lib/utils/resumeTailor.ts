import {
  isJobMetadataLine,
  isProtectedResumeLine,
  sanitizeBulletText,
} from '@/lib/resume/resumeLines';
import { applyFormattedSuggestedTitle, ensureHeaderContactLocation, ensureHeaderTitleAndContact } from '@/lib/resume/resumeHeaderFormat';
import { collectForbiddenTitleNorms } from '@/lib/resume/docxTitlePatch';
import { enhanceSkillsInPlainText } from '@/lib/resume/skillsTailor';
import {
  isHeadlineOrTitleLine,
  isLikelyJobTitleLine,
  isMultiTitleHeadline,
  removeStrayTitleLines,
  repairSkillsSection,
  restoreEducationAndCertLines,
} from '@/lib/resume/resumeStructure';

export interface TailorValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface TailorValidationResult {
  passed: boolean;
  checks: TailorValidationCheck[];
  rejectedChangeCount: number;
  autoRevisions: string[];
}

export interface TailoringSummary {
  jdTitle?: string;
  jdKeywordsUsed: string[];
  sectionsUpdated: string[];
  skillsPreserved: string[];
  unsupportedNotAdded: string[];
  validation: TailorValidationResult;
}

export interface ResumeSectionChange {
  label: string;
  original: string;
  tailored: string;
}

export interface TailorResult {
  matchScoreBefore: number;
  matchScoreAfter: number;
  missingKeywords: string[];
  addedKeywords: string[];
  suggestedTitle: string;
  atsWarnings: string[];
  optimizedSummary: string;
  optimizedSkills: string[];
  sectionChanges: ResumeSectionChange[];
  tailoredResumeText: string;
  overallFeedback: string;
  tailoringSummary?: TailoringSummary;
}

export interface TextSegment {
  text: string;
  changed: boolean;
  variant?: 'keyword' | 'impact' | 'ai';
}

const SECTION_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|EXPERIENCE|WORK EXPERIENCE|PROFESSIONAL EXPERIENCE|EMPLOYMENT|EDUCATION|SKILLS|TECHNICAL SKILLS|CORE COMPETENCIES|CERTIFICATIONS|PROJECTS|AWARDS|ACHIEVEMENTS|LEADERSHIP)$/i;

function normalizeWs(s: string): string {
  return sanitizeBulletText(s).replace(/\s+/g, ' ').trim();
}

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 55) return false;
  if (SECTION_RE.test(t)) return true;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && !t.includes('@') && !t.includes('|');
}

function searchVariants(text: string): string[] {
  const trimmed = sanitizeBulletText(text);
  const norm = normalizeWs(trimmed);
  return [...new Set([trimmed, norm].filter(Boolean))];
}

export function normalizeSectionChange(change: ResumeSectionChange): ResumeSectionChange | null {
  const original = sanitizeBulletText(change.original || '');
  const tailored = sanitizeBulletText(change.tailored || '');
  if (!original || !tailored || original === tailored) return null;
  if (isProtectedResumeLine(original) || isJobMetadataLine(original)) return null;
  if (isSectionHeading(original)) return null;
  // Never let a change turn any line into a job title / pipe-joined headline.
  if (isMultiTitleHeadline(tailored)) return null;
  if (isHeadlineOrTitleLine(tailored) && !isHeadlineOrTitleLine(original)) return null;
  if (isLikelyJobTitleLine(tailored) && !isLikelyJobTitleLine(original)) return null;
  return { ...change, original, tailored };
}

export function filterSectionChanges(changes: ResumeSectionChange[]): ResumeSectionChange[] {
  const seen = new Set<string>();
  const out: ResumeSectionChange[] = [];

  for (const raw of changes) {
    const change = normalizeSectionChange(raw);
    if (!change) continue;
    const key = normalizeWs(change.original);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(change);
  }

  return out;
}

function replaceFirst(haystack: string, needle: string, repl: string): string | null {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return null;
  return haystack.slice(0, idx) + repl + haystack.slice(idx + needle.length);
}

/** Apply one section change — exact line match only, never add bullet characters. */
export function applySingleChange(text: string, change: ResumeSectionChange): string {
  const normalized = normalizeSectionChange(change);
  if (!normalized) return text;

  const from = normalized.original;
  const to = normalized.tailored;

  for (const variant of searchVariants(from)) {
    const replaced = replaceFirst(text, variant, to);
    if (replaced) return replaced;
  }

  const lines = text.split('\n');
  const fromNorm = normalizeWs(from);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isProtectedResumeLine(line)) continue;

    const lineNorm = normalizeWs(line);
    if (lineNorm === fromNorm) {
      lines[i] = to;
      return lines.join('\n');
    }
  }

  return text;
}

export function applySectionChanges(
  originalText: string,
  changes: ResumeSectionChange[],
): { text: string; appliedCount: number } {
  let text = originalText;
  let appliedCount = 0;

  for (const change of filterSectionChanges(changes)) {
    const before = text;
    text = applySingleChange(text, change);
    if (text !== before) appliedCount++;
  }

  return { text, appliedCount };
}

function findSummaryBlock(lines: string[]): { start: number; end: number } | null {
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^(PROFESSIONAL )?SUMMARY$/i.test(lines[i].trim())) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  let end = headingIdx + 1;
  while (end < lines.length) {
    const t = lines[end].trim();
    if (!t) {
      end++;
      continue;
    }
    if (isSectionHeading(t)) break;
    end++;
  }

  return { start: headingIdx + 1, end };
}

export function extractSummaryLines(text: string): string[] {
  const lines = text.split('\n');
  const block = findSummaryBlock(lines);
  if (!block) return [];
  return lines.slice(block.start, block.end).map((l) => sanitizeBulletText(l)).filter(Boolean);
}

export function extractSummaryText(text: string): string | null {
  const content = extractSummaryLines(text);
  return content.join(' ') || null;
}

export function applyOptimizedSummary(text: string, summary: string): string {
  const trimmed = sanitizeBulletText(summary);
  if (!trimmed) return text;

  const lines = text.split('\n');
  const block = findSummaryBlock(lines);

  if (block) {
    return [...lines.slice(0, block.start), trimmed, ...lines.slice(block.end)].join('\n');
  }

  return text;
}

export function applySuggestedTitle(text: string, title: string): string {
  const trimmed = sanitizeBulletText(title);
  if (!trimmed) return text;
  // Headline = role titles only; location stays on the contact line below.
  return applyFormattedSuggestedTitle(text, trimmed);
}

/** Remove consecutive duplicate lines and stray metadata duplicates in body. */
export function dedupeTailoredText(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  const seenNorm = new Set<string>();
  let inExperience = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      out.push('');
      continue;
    }

    if (/^PROFESSIONAL EXPERIENCE$/i.test(line)) {
      inExperience = true;
      seenNorm.clear();
      out.push(raw);
      continue;
    }

    if (isSectionHeading(line) && !/^PROFESSIONAL EXPERIENCE$/i.test(line)) {
      inExperience = /^EDUCATION|^SKILLS|^CORE/i.test(line) ? false : inExperience;
      if (isSectionHeading(line)) seenNorm.clear();
      out.push(raw);
      continue;
    }

    const norm = normalizeWs(line);

    if (seenNorm.has(norm)) continue;

    if (inExperience && isJobMetadataLine(line)) {
      const metaCount = out.filter((l) => isJobMetadataLine(l.trim())).length;
      const expMetaInBlock = out.slice(-8).filter((l) => isJobMetadataLine(l.trim())).length;
      if (expMetaInBlock >= 1) continue;
    }

    seenNorm.add(norm);
    out.push(sanitizeBulletText(line) === line ? raw : sanitizeBulletText(line));
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function buildTailoredText(originalText: string, result: TailorResult, jdText = ''): string {
  let text = originalText;

  const changes = filterSectionChanges(result.sectionChanges ?? []);
  if (changes.length) {
    text = applySectionChanges(text, changes).text;
  }

  if (result.optimizedSummary?.trim()) {
    text = applyOptimizedSummary(text, result.optimizedSummary);
  }

  if (result.suggestedTitle?.trim()) {
    text = applySuggestedTitle(text, result.suggestedTitle);
  }

  text = ensureHeaderContactLocation(text, originalText);

  if (jdText.trim()) {
    text = enhanceSkillsInPlainText(originalText, text, jdText);
  }

  text = dedupeTailoredText(text);

  text = repairSkillsSection(originalText, text);

  const forbidden = [...collectForbiddenTitleNorms(originalText, result.suggestedTitle)];
  text = removeStrayTitleLines(originalText, text, forbidden);

  text = restoreEducationAndCertLines(originalText, text);

  text = ensureHeaderTitleAndContact(originalText, text, result.suggestedTitle);

  if (text !== originalText) return text;
  return originalText;
}

export function buildHighlightedSegments(
  tailoredText: string,
  changes: ResumeSectionChange[],
): TextSegment[] {
  let segments: TextSegment[] = [{ text: tailoredText, changed: false }];

  for (const change of changes) {
    const needle = sanitizeBulletText(change.tailored || '');
    if (!needle) continue;

    const next: TextSegment[] = [];
    for (const seg of segments) {
      if (seg.changed) {
        next.push(seg);
        continue;
      }

      let rest = seg.text;
      while (rest.length > 0) {
        const idx = rest.indexOf(needle);
        if (idx === -1) {
          next.push({ text: rest, changed: false });
          break;
        }
        if (idx > 0) next.push({ text: rest.slice(0, idx), changed: false });
        next.push({ text: needle, changed: true, variant: 'ai' });
        rest = rest.slice(idx + needle.length);
      }
    }
    segments = next;
  }

  return segments.filter((s) => s.text.length > 0);
}

export function parseTailorResponse(raw: string): TailorResult {
  const block = extractJsonBlock(raw);
  let parsed: Partial<TailorResult>;

  try {
    parsed = JSON.parse(block) as Partial<TailorResult>;
  } catch {
    parsed = tryRepairTailorJson(block);
  }

  const sectionChanges = filterSectionChanges(parsed.sectionChanges ?? []);

  if (!sectionChanges.length && !parsed.optimizedSummary?.trim()) {
    throw new Error(
      'AI response was cut off or invalid JSON. Try a shorter job description, or run Analyze again.',
    );
  }

  return {
    matchScoreBefore: Number(parsed.matchScoreBefore) || 0,
    matchScoreAfter: Number(parsed.matchScoreAfter) || 0,
    missingKeywords: parsed.missingKeywords ?? [],
    addedKeywords: parsed.addedKeywords ?? [],
    suggestedTitle: sanitizeBulletText(parsed.suggestedTitle ?? ''),
    atsWarnings: parsed.atsWarnings ?? [],
    optimizedSummary: sanitizeBulletText(parsed.optimizedSummary ?? ''),
    optimizedSkills: parsed.optimizedSkills ?? [],
    sectionChanges,
    tailoredResumeText: parsed.tailoredResumeText ?? '',
    overallFeedback: parsed.overallFeedback ?? '',
  };
}

function extractJsonBlock(raw: string): string {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  if (start === -1) throw new Error('AI returned invalid JSON. Try again.');
  return cleaned.slice(start);
}

function closeOpenJsonBrackets(s: string): string {
  const stack: ('{' | '[')[] = [];
  let inStr = false;
  let esc = false;

  for (const c of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (c === '\\') {
      esc = true;
      continue;
    }
    if (c === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (c === '{') stack.push('{');
    else if (c === '[') stack.push('[');
    else if (c === '}') stack.pop();
    else if (c === ']') stack.pop();
  }

  let out = s;
  if (inStr) out += '"';
  out = out.replace(/,\s*"[^"]*"?\s*:\s*"?[^"}\]]*$/s, '');
  out = out.replace(/,\s*$/, '');

  while (stack.length) {
    out += stack.pop() === '[' ? ']' : '}';
  }
  return out;
}

function unescapeJsonString(s: string): string {
  return s.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function salvageTailorFields(jsonStr: string): Partial<TailorResult> {
  const num = (key: string) => {
    const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`));
    return m ? parseInt(m[1], 10) : undefined;
  };
  const strField = (key: string) => {
    const m = jsonStr.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
    return m ? unescapeJsonString(m[1]) : undefined;
  };

  const sectionChanges: ResumeSectionChange[] = [];
  const changeRe =
    /\{\s*"label"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"original"\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*"tailored"\s*:\s*"((?:\\.|[^"\\])*)"\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = changeRe.exec(jsonStr)) !== null) {
    sectionChanges.push({
      label: unescapeJsonString(m[1]),
      original: unescapeJsonString(m[2]),
      tailored: unescapeJsonString(m[3]),
    });
  }

  return {
    matchScoreBefore: num('matchScoreBefore'),
    matchScoreAfter: num('matchScoreAfter'),
    suggestedTitle: strField('suggestedTitle'),
    optimizedSummary: strField('optimizedSummary'),
    overallFeedback: strField('overallFeedback'),
    sectionChanges,
  };
}

function tryRepairTailorJson(block: string): Partial<TailorResult> {
  for (let i = block.length; i > 20; i--) {
    if (block[i - 1] !== '}') continue;
    const slice = block.slice(0, i);
    try {
      return JSON.parse(closeOpenJsonBrackets(slice)) as Partial<TailorResult>;
    } catch {
      /* keep trying */
    }
  }

  const salvaged = salvageTailorFields(block);
  if (salvaged.sectionChanges?.length || salvaged.optimizedSummary) {
    return salvaged;
  }

  throw new Error(
    'AI response was cut off or invalid JSON. Try a shorter job description, or run Analyze again.',
  );
}
