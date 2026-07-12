import {
  buildFormattedHeaderUpdate,
  detectHeaderPattern,
  extractHeaderLocation,
  formattedHeadlineLine,
  parseContactSegments,
  type HeaderLineRole,
  type HeaderPattern,
} from '@/lib/resume/resumeHeaderFormat';
import { sanitizeBulletText } from '@/lib/resume/resumeLines';
import {
  isHeaderContactLine,
  isLikelyJobTitleLine,
  isMultiTitleHeadline,
  isPlausibleCandidateName,
  isSectionHeading,
  parseResumeStructure,
  sectionLines,
} from '@/lib/resume/resumeStructure';

export { isPlausibleCandidateName };

export interface SourceResumeSnapshot {
  originalText: string;
  candidateName: string;
  originalHeaderLines: readonly string[];
  detectedHeaderPattern: HeaderPattern | null;
  originalTitleLine: string | null;
  originalContactLine: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  linkedIn: string | null;
  originalCertificationLines: readonly string[];
  originalSectionOrder: readonly string[];
  originalSkillCategories: readonly string[];
}

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function headerLines(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    out.push(t);
  }
  return out;
}

function hasResumeSectionStructure(text: string): boolean {
  return parseResumeStructure(text).sectionHeadings.length > 0;
}

/** Higher = more trustworthy immutable source text. */
export function scoreSourceTextForSnapshot(text: string, candidateNameHint?: string): number {
  const trimmed = text.trim();
  if (!trimmed) return -1000;

  let score = 0;
  const structure = parseResumeStructure(trimmed);
  const pattern = detectHeaderPattern(trimmed);
  const sectionCount = structure.sectionHeadings.length;

  score += sectionCount * 40;
  if (sectionCount === 0) score -= 200;

  if (pattern) {
    const headerCount = pattern.originalLineCount;
    if (headerCount >= 2 && headerCount <= 6) score += 50;
    if (headerCount > 8) score -= 150;

    if (isPlausibleCandidateName(pattern.nameLine)) score += 80;
    else score -= 120;

    if (pattern.titleLine) score += 20;
    if (pattern.contactLine) score += 20;

    if (candidateNameHint && norm(pattern.nameLine) === norm(candidateNameHint)) score += 100;
  } else {
    score -= 80;
  }

  return score;
}

function textHasCandidateName(text: string, name: string): boolean {
  const target = norm(name);
  if (!target) return false;
  return text.split('\n').some((l) => norm(l.trim()) === target);
}

/** Prepend a plausible candidate name when mammoth/plain text dropped the first line. */
function prependNameIfMissing(text: string, candidateNameHint?: string): string {
  const hint = candidateNameHint?.trim() ?? '';
  if (!hint || !isPlausibleCandidateName(hint)) return text.trim();
  const trimmed = text.trim();
  if (!trimmed) return hint;
  if (textHasCandidateName(trimmed, hint)) return trimmed;
  return `${hint}\n${trimmed}`;
}

/**
 * Choose the best immutable baseline text from stored DB text, DOCX plain text,
 * and/or DOCX XML paragraph list. Never returns tailored/generated text.
 */
export function pickImmutableSourceText(
  storedText: string,
  docxPlainText: string,
  docxParagraphs?: readonly string[],
  candidateNameHint?: string,
): string {
  const candidates: string[] = [];

  const push = (t: string) => {
    const v = prependNameIfMissing(t, candidateNameHint);
    if (v && !candidates.some((c) => c === v)) candidates.push(v);
  };

  push(storedText);
  push(docxPlainText);

  if (docxParagraphs?.length) {
    push(docxParagraphs.join('\n'));

    const nameFromXml =
      docxParagraphs.find((p) => isPlausibleCandidateName(p.trim()))?.trim() ??
      docxParagraphs[0]?.trim() ??
      '';
    const hint = candidateNameHint?.trim() ?? '';
    const nameLine =
      (hint && isPlausibleCandidateName(hint) ? hint : '') ||
      (isPlausibleCandidateName(nameFromXml) ? nameFromXml : '');

    if (nameLine) {
      for (const base of [storedText, docxPlainText, docxParagraphs.join('\n')]) {
        const b = base.trim();
        if (b && !textHasCandidateName(b, nameLine)) {
          push(`${nameLine}\n${b}`);
        }
      }
    }
  }

  if (!candidates.length) {
    return prependNameIfMissing(storedText.trim() || docxPlainText.trim(), candidateNameHint);
  }

  let best = candidates[0];
  let bestScore = scoreSourceTextForSnapshot(best, candidateNameHint);
  for (let i = 1; i < candidates.length; i++) {
    const s = scoreSourceTextForSnapshot(candidates[i], candidateNameHint);
    if (s > bestScore) {
      bestScore = s;
      best = candidates[i];
    }
  }
  return best;
}

function buildPatternFromHeaderHints(
  baseline: string,
  candidateNameHint?: string,
): HeaderPattern | null {
  const lines = headerLines(baseline);
  if (!lines.length) return null;

  let nameLine = lines.find((l) => isPlausibleCandidateName(l)) ?? '';
  if (!nameLine && candidateNameHint && isPlausibleCandidateName(candidateNameHint)) {
    nameLine = candidateNameHint.trim();
  }
  if (!nameLine) return null;

  const rest = lines.filter((l) => norm(l) !== norm(nameLine));
  let contactLine: string | null = null;
  let titleLine: string | null = null;
  for (const line of rest) {
    if (!contactLine && isHeaderContactLine(line)) contactLine = line;
    else if (!titleLine && (isMultiTitleHeadline(line) || isLikelyJobTitleLine(line))) titleLine = line;
  }

  const lineOrder: HeaderLineRole[] = ['name'];
  if (contactLine && titleLine) {
    const contactIdx = lines.indexOf(contactLine);
    const titleIdx = lines.indexOf(titleLine);
    if (contactIdx >= 0 && titleIdx >= 0 && contactIdx < titleIdx) {
      lineOrder.push('contact', 'title');
    } else {
      lineOrder.push('title', 'contact');
    }
  } else if (titleLine) {
    lineOrder.push('title');
  } else if (contactLine) {
    lineOrder.push('contact');
  }

  return {
    nameLine,
    titleLine,
    contactLine,
    lineOrder,
    contactBeforeTitle: lineOrder.indexOf('contact') > 0 && lineOrder.indexOf('contact') < lineOrder.indexOf('title'),
    originalLineCount: Math.min(lines.length, 6),
  };
}

function repairPatternWithNameHint(
  pattern: HeaderPattern,
  candidateNameHint?: string,
): HeaderPattern {
  if (!candidateNameHint?.trim()) return pattern;
  if (isPlausibleCandidateName(pattern.nameLine)) return pattern;

  const hint = candidateNameHint.trim();
  if (!isPlausibleCandidateName(hint)) return pattern;

  const lineOrder: HeaderLineRole[] = ['name'];
  if (pattern.contactBeforeTitle) {
    lineOrder.push('contact');
    if (pattern.titleLine) lineOrder.push('title');
  } else {
    if (pattern.titleLine) lineOrder.push('title');
    if (pattern.contactLine) lineOrder.push('contact');
  }

  const originalLineCount = Math.min(
    Math.max(2, lineOrder.length),
    pattern.originalLineCount <= 8 ? pattern.originalLineCount : lineOrder.length,
  );

  return {
    ...pattern,
    nameLine: hint,
    lineOrder,
    originalLineCount,
  };
}

/**
 * Build expected DOCX header lines ONLY from immutable snapshot fields + suggested title.
 * Never reads tailoredText, fallbackText, or generated DOCX text.
 */
export function buildExpectedHeaderFromSnapshot(
  snapshot: SourceResumeSnapshot,
  suggestedTitle?: string,
): string[] {
  const pattern = snapshot.detectedHeaderPattern;
  if (!pattern) return [];

  let titleLine = snapshot.originalTitleLine ?? '';
  let contactLine = snapshot.originalContactLine ?? '';

  if (suggestedTitle?.trim()) {
    const fromText = formattedHeadlineLine(snapshot.originalText, suggestedTitle);
    titleLine = fromText || sanitizeBulletText(suggestedTitle);

    const update = buildFormattedHeaderUpdate(snapshot.originalText, suggestedTitle);
    if (update?.contactLine) contactLine = update.contactLine;
  }

  if (snapshot.location && contactLine) {
    const parts = parseContactSegments(contactLine);
    if (!parts.location) contactLine = `${snapshot.location} | ${contactLine}`;
  }

  const byRole: Record<HeaderLineRole, string> = {
    name: snapshot.candidateName,
    title: titleLine,
    contact: contactLine,
  };

  return pattern.lineOrder.map((role) => byRole[role]).filter((line) => line.trim());
}

export function isValidSourceSnapshot(snapshot: SourceResumeSnapshot | null | undefined): boolean {
  if (!snapshot?.candidateName?.trim()) return false;
  if (!isPlausibleCandidateName(snapshot.candidateName)) return false;
  if (!snapshot.detectedHeaderPattern) return false;
  if ((snapshot.detectedHeaderPattern.originalLineCount ?? 0) > 8) return false;
  if (!hasResumeSectionStructure(snapshot.originalText)) return false;
  if (!textHasCandidateName(snapshot.originalText, snapshot.candidateName)) return false;
  const patternName = snapshot.detectedHeaderPattern.nameLine?.trim() ?? '';
  if (patternName && norm(patternName) !== norm(snapshot.candidateName)) return false;
  return true;
}

/**
 * Preserve certification lines from the immutable source text.
 */
export function extractOriginalCertificationLinesFromText(originalText: string): string[] {
  const lines = originalText.split('\n');
  let mode: 'none' | 'dedicated' | 'combined' = 'none';
  const out: string[] = [];

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    if (isSectionHeading(t)) {
      if (/^CERTIFICATIONS?$/i.test(t)) mode = 'dedicated';
      else if (/EDUCATION.*CERTIFICATION|CERTIFICATION.*EDUCATION/i.test(t)) mode = 'combined';
      else mode = 'none';
      continue;
    }
    if (mode === 'none') continue;
    if (mode === 'dedicated') {
      out.push(t);
      continue;
    }
    if (
      /certification|certified|certificate|salesforce|aws certified|azure|google cloud|pmp|csm|cpa|pl-300/i.test(
        t,
      )
    ) {
      out.push(t);
    }
  }

  if (out.length) return out;
  return sectionLines(originalText, /CERTIFICATION/i);
}

function contactFromHeaderLines(lines: readonly string[]): string | null {
  for (const line of lines) {
    const parts = parseContactSegments(line);
    if (parts.email || parts.phone || parts.linkedin) return line;
  }
  return null;
}

export interface CreateSnapshotOptions {
  candidateNameHint?: string;
  storedText?: string;
  docxPlainText?: string;
  docxParagraphs?: readonly string[];
}

export function createSourceResumeSnapshot(
  originalText: string,
  options?: CreateSnapshotOptions,
): SourceResumeSnapshot {
  const baseline = options
    ? pickImmutableSourceText(
        options.storedText ?? originalText,
        options.docxPlainText ?? originalText,
        options.docxParagraphs,
        options.candidateNameHint,
      )
    : originalText.trim();

  const structure = parseResumeStructure(baseline);
  let pattern = detectHeaderPattern(baseline) ?? buildPatternFromHeaderHints(baseline, options?.candidateNameHint);

  const headers = headerLines(baseline);
  const contactLine = pattern?.contactLine ?? contactFromHeaderLines(headers);
  const contactParts = parseContactSegments(contactLine ?? '');
  const hintedName =
    options?.candidateNameHint?.trim() && isPlausibleCandidateName(options.candidateNameHint)
      ? options.candidateNameHint.trim()
      : '';
  const parsedName =
    pattern?.nameLine && isPlausibleCandidateName(pattern.nameLine) ? pattern.nameLine : '';
  const scannedName = headers.find((l) => isPlausibleCandidateName(l)) ?? '';
  const candidateName = parsedName || hintedName || scannedName;

  if (pattern && candidateName) {
    pattern = repairPatternWithNameHint(pattern, candidateName);
  }

  const snapshot: SourceResumeSnapshot = {
    originalText: baseline,
    candidateName,
    originalHeaderLines: Object.freeze([...headers]),
    detectedHeaderPattern: pattern ?? null,
    originalTitleLine: pattern?.titleLine ?? null,
    originalContactLine: contactLine ?? null,
    location: extractHeaderLocation(baseline),
    phone: contactParts.phone,
    email: contactParts.email,
    linkedIn: contactParts.linkedin,
    originalCertificationLines: Object.freeze(extractOriginalCertificationLinesFromText(baseline)),
    originalSectionOrder: Object.freeze([...structure.sectionHeadings]),
    originalSkillCategories: Object.freeze([...structure.skillCategories]),
  };
  return Object.freeze(snapshot);
}
