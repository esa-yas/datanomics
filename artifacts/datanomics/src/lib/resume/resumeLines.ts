import { buildFormattedHeaderUpdate, ensureHeaderContactLocation } from '@/lib/resume/resumeHeaderFormat';

/** One line from the uploaded file — order and bullet flag preserved, no inferred styling. */
export interface ResumeLine {
  text: string;
  isBullet: boolean;
  bulletChar: string;
  isBlank: boolean;
  rawLine: string;
}

const BULLET_START = /^([•\-\–*●▪◦‣▸►])\s*(.*)$/;

/** Strip leading bullet characters — Word lists already provide bullets in DOCX. */
export function sanitizeBulletText(text: string): string {
  return text.replace(BULLET_START, '$2').trim();
}

/** Company | Location | Date lines — never edit or duplicate these. */
export function isJobMetadataLine(text: string): boolean {
  const t = text.trim();
  if (!t.includes('|')) return false;
  return (
    /\b(19|20)\d{2}\b/.test(t) ||
    /\bPresent\b/i.test(t) ||
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i.test(t)
  );
}

export function isProtectedResumeLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (isJobMetadataLine(t)) return true;
  if (/^(PROFESSIONAL SUMMARY|SUMMARY|PROFESSIONAL EXPERIENCE|EXPERIENCE|EDUCATION|EDUCATION & CERTIFICATIONS|CERTIFICATIONS|SKILLS|TECHNICAL SKILLS|CORE DATA)/i.test(t)) {
    return true;
  }
  if (t.includes('@') && t.includes('|')) return true;
  return false;
}

export function parseFaithfulLines(text: string): ResumeLine[] {
  return text.split('\n').map((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      return { text: '', isBullet: false, bulletChar: '', isBlank: true, rawLine: raw };
    }
    const m = trimmed.match(BULLET_START);
    if (m) {
      return {
        isBullet: true,
        bulletChar: m[1],
        text: m[2].trim(),
        isBlank: false,
        rawLine: raw,
      };
    }
    return { text: trimmed, isBullet: false, bulletChar: '', isBlank: false, rawLine: raw };
  });
}

/** Plain text for AI / matching — no bullet prefix (Word handles bullets in DOCX). */
export function linesToPlainText(lines: ResumeLine[]): string {
  return lines
    .map((l) => {
      if (l.isBlank) return '';
      return l.text;
    })
    .join('\n');
}

const JOB_TITLE_WORD =
  /\b(Analyst|Engineer|Developer|Consultant|Manager|Director|Specialist|Architect|Administrator|Lead|Intern|Coordinator|Scientist|Designer|Strategist|Officer|Associate|Advisor|Head)\b/i;

/** Local guard (no import cycle): true for a job-title / pipe-joined headline value. */
function isTitleLikeValue(text: string): boolean {
  const t = sanitizeBulletText(text);
  if (t.includes(':') || t.includes('@')) return false;
  if (/[.;]/.test(t)) return false;
  if (t.includes('|')) {
    if (isJobMetadataLine(t)) return false;
    const segments = t.split('|').map((s) => s.trim()).filter(Boolean);
    const titleSegs = segments.filter(
      (s) => s.split(/\s+/).filter(Boolean).length <= 5 && JOB_TITLE_WORD.test(s),
    );
    return titleSegs.length >= 2;
  }
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 7) return false;
  if (!JOB_TITLE_WORD.test(t)) return false;
  if (/\b(led|built|delivered|developed|designed|created|automated|optimized|drove|managed|implemented|analyzed|reduced|increased|improved|supported|partnered|using|with|for|to)\b/i.test(t)) {
    return false;
  }
  return true;
}

/** Apply AI edits onto structured lines — preserves bullet vs paragraph structure. */
export function applyChangesToLines(
  lines: ResumeLine[],
  changes: { original: string; tailored: string }[],
): ResumeLine[] {
  const next = lines.map((l) => ({ ...l }));

  for (const change of changes) {
    const from = sanitizeBulletText(change.original || '');
    const to = sanitizeBulletText(change.tailored || '');
    if (!from || !to || from === to) continue;
    // Never let a bullet/line become a job title or pipe-joined headline.
    if (isTitleLikeValue(to) && !isTitleLikeValue(from)) continue;

    for (let i = 0; i < next.length; i++) {
      const line = next[i];
      if (line.isBlank || isProtectedResumeLine(line.text)) continue;

      const lineText = sanitizeBulletText(line.text);
      if (lineText === from) {
        next[i] = { ...line, text: to, rawLine: to };
        break;
      }
    }
  }

  return next;
}

export function applySummaryToLines(lines: ResumeLine[], summary: string): ResumeLine[] {
  const trimmed = summary.trim();
  if (!trimmed) return lines;

  const next = lines.map((l) => ({ ...l }));
  let summaryIdx = -1;
  for (let i = 0; i < next.length; i++) {
    if (/^(PROFESSIONAL )?SUMMARY$/i.test(next[i].text.trim())) {
      summaryIdx = i;
      break;
    }
  }
  if (summaryIdx === -1) return next;

  let end = summaryIdx + 1;
  while (end < next.length) {
    const t = next[end].text.trim();
    if (!t) {
      end++;
      continue;
    }
    if (/^(PROFESSIONAL )?SUMMARY$/i.test(t)) break;
    if (/^(CORE DATA|PROFESSIONAL EXPERIENCE|EXPERIENCE|SKILLS|EDUCATION)/i.test(t)) break;
    end++;
  }

  const summaryLine: ResumeLine = {
    text: trimmed,
    isBullet: false,
    bulletChar: '',
    isBlank: false,
    rawLine: trimmed,
  };

  return [...next.slice(0, summaryIdx + 1), summaryLine, ...next.slice(end)];
}

export function applyTitleToLines(lines: ResumeLine[], title: string): ResumeLine[] {
  const trimmed = title.trim();
  if (!trimmed) return lines;

  const update = buildFormattedHeaderUpdate(linesToPlainText(lines), trimmed);
  if (!update || update.headlineIdx >= lines.length) return lines;

  const next = lines.map((l) => ({ ...l }));
  next[update.headlineIdx] = {
    ...next[update.headlineIdx],
    text: update.headlineLine,
    rawLine: update.headlineLine,
  };
  if (update.contactLine && update.contactIdx !== null && update.contactIdx < next.length) {
    next[update.contactIdx] = {
      ...next[update.contactIdx],
      text: update.contactLine,
      rawLine: update.contactLine,
    };
  }
  return next;
}

export function buildTailoredLines(
  originalLines: ResumeLine[],
  result: {
    sectionChanges?: { original: string; tailored: string }[];
    optimizedSummary?: string;
    suggestedTitle?: string;
  },
): ResumeLine[] {
  let lines = applyChangesToLines(originalLines, result.sectionChanges ?? []);
  if (result.optimizedSummary?.trim()) {
    lines = applySummaryToLines(lines, result.optimizedSummary);
  }
  if (result.suggestedTitle?.trim()) {
    lines = applyTitleToLines(lines, result.suggestedTitle);
  }
  const plain = linesToPlainText(lines);
  const withContact = ensureHeaderContactLocation(plain, linesToPlainText(originalLines));
  if (withContact !== plain) {
    return parseFaithfulLines(withContact);
  }
  return lines;
}
