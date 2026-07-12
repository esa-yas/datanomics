import { sanitizeBulletText } from '@/lib/resume/resumeLines';
import { extractSummaryText } from '@/lib/utils/resumeTailor';

const SECTION_HEADING_RE =
  /^(PROFESSIONAL SUMMARY|SUMMARY|TECHNICAL SKILLS|CORE DATA|SKILLS|PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS|AWARDS)$/i;

export interface DocxSummaryValidation {
  passed: boolean;
  patchedSummary: string | null;
  originalSummary: string | null;
  expectedSummary: string;
  detail: string;
}

interface ParagraphSlice {
  index: number;
  full: string;
  start: number;
  end: number;
  text: string;
}

interface SummaryBodyRange {
  headingIdx: number;
  bodyStart: number;
  bodyEnd: number;
  inlineBody: boolean;
  headingLabel: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphPlainText(pXml: string): string {
  return pXml
    .replace(/<w:tab[^/>]*\/>/g, '\t')
    .replace(/<w:br[^/>]*\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeHeadingText(text: string): string {
  return text.trim().replace(/:$/, '').replace(/\s+/g, ' ');
}

function isSummaryHeadingOnly(text: string): boolean {
  return /^(PROFESSIONAL )?SUMMARY$/i.test(normalizeHeadingText(text));
}

function detectSummaryInParagraph(text: string): {
  isSummary: boolean;
  headingLabel: string;
  bodyText: string | null;
} {
  const t = text.trim();
  const norm = normalizeHeadingText(t);
  if (/^(PROFESSIONAL )?SUMMARY$/i.test(norm)) {
    return { isSummary: true, headingLabel: t.trim(), bodyText: null };
  }

  const combined = t.match(/^((?:PROFESSIONAL\s+)?SUMMARY)\s*:?\s+([\s\S]{20,})$/i);
  if (combined) {
    return {
      isSummary: true,
      headingLabel: combined[1].trim(),
      bodyText: combined[2].trim(),
    };
  }

  return { isSummary: false, headingLabel: '', bodyText: null };
}

function sliceParagraphs(xml: string): ParagraphSlice[] {
  const slices: ParagraphSlice[] = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = re.exec(xml)) !== null) {
    slices.push({
      index: index++,
      full: m[0],
      start: m.index,
      end: m.index + m[0].length,
      text: paragraphPlainText(m[0]),
    });
  }
  return slices;
}

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 70) return false;
  if (SECTION_HEADING_RE.test(t)) return true;
  return t === t.toUpperCase() && /[A-Z]/.test(t) && !t.includes('@') && !t.includes('|');
}

function findSummaryBodyRange(slices: ParagraphSlice[]): SummaryBodyRange | null {
  for (let i = 0; i < slices.length; i++) {
    const detected = detectSummaryInParagraph(slices[i].text);
    if (!detected.isSummary) continue;

    if (detected.bodyText) {
      return {
        headingIdx: i,
        bodyStart: i,
        bodyEnd: i + 1,
        inlineBody: true,
        headingLabel: detected.headingLabel,
      };
    }

    let bodyStart = i + 1;
    while (bodyStart < slices.length && !slices[bodyStart].text.trim()) bodyStart++;

    let bodyEnd = bodyStart;
    while (bodyEnd < slices.length) {
      const t = slices[bodyEnd].text.trim();
      if (!t) {
        bodyEnd++;
        continue;
      }
      if (isSectionHeading(t) && !isSummaryHeadingOnly(t)) break;
      bodyEnd++;
    }

    return {
      headingIdx: i,
      bodyStart,
      bodyEnd: Math.max(bodyStart, bodyEnd),
      inlineBody: false,
      headingLabel: detected.headingLabel,
    };
  }
  return null;
}

function setParagraphText(pXml: string, text: string): string {
  const escaped = escapeXml(text);
  if (/<w:t[\s>]/.test(pXml)) {
    let first = true;
    return pXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (_m, attrs, _content) => {
      if (first) {
        first = false;
        const a = String(attrs).includes('xml:space') ? attrs : `${attrs} xml:space="preserve"`;
        return `<w:t${a}>${escaped}</w:t>`;
      }
      return `<w:t${attrs}></w:t>`;
    });
  }
  const run = `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r>`;
  return pXml.replace(/<\/w:p>/, `${run}</w:p>`);
}

function clearParagraph(pXml: string): string {
  return setParagraphText(pXml, '');
}

function createParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function replaceInlineSummaryParagraph(pXml: string, headingLabel: string, newBody: string): string {
  const openMatch = pXml.match(/^(<w:p(?:\s[^>]*)?>)/);
  const open = openMatch?.[1] ?? '<w:p>';
  const pPrMatch = pXml.match(/<w:pPr[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch?.[0] ?? '';
  const heading = escapeXml(headingLabel);
  const body = escapeXml(newBody);
  return `${open}${pPr}<w:r><w:t xml:space="preserve">${heading}</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">${body}</w:t></w:r></w:p>`;
}

function rebuildXml(xml: string, slices: ParagraphSlice[], replacements: Map<number, string>): string {
  let out = '';
  let last = 0;
  for (const slice of slices) {
    out += xml.slice(last, slice.start);
    out += replacements.get(slice.index) ?? slice.full;
    last = slice.end;
  }
  out += xml.slice(last);
  return out;
}

/** Read summary body text currently in Word XML. */
export function extractSummaryFromWordXml(xml: string): string | null {
  const slices = sliceParagraphs(xml);
  const range = findSummaryBodyRange(slices);
  if (!range) return null;

  if (range.inlineBody) {
    return detectSummaryInParagraph(slices[range.headingIdx].text).bodyText;
  }

  const parts = slices
    .slice(range.bodyStart, range.bodyEnd)
    .map((s) => s.text.trim())
    .filter(Boolean);
  return parts.join(' ') || null;
}

/**
 * Replace all paragraphs under PROFESSIONAL SUMMARY with the new summary text.
 * Does not rely on matching the old summary string — uses section structure.
 */
export function replaceSummarySectionInWordXml(xml: string, newSummary: string): string | null {
  const tailored = sanitizeBulletText(newSummary);
  if (!tailored) return null;

  const slices = sliceParagraphs(xml);
  const range = findSummaryBodyRange(slices);
  if (!range) return null;

  const replacements = new Map<number, string>();

  if (range.inlineBody) {
    replacements.set(
      range.bodyStart,
      replaceInlineSummaryParagraph(slices[range.bodyStart].full, range.headingLabel, tailored),
    );
    return rebuildXml(xml, slices, replacements);
  }

  if (range.bodyStart >= range.bodyEnd) {
    const heading = slices[range.headingIdx];
    const insert = createParagraph(tailored);
    return xml.slice(0, heading.end) + insert + xml.slice(heading.end);
  }

  replacements.set(range.bodyStart, setParagraphText(slices[range.bodyStart].full, tailored));
  for (let i = range.bodyStart + 1; i < range.bodyEnd; i++) {
    replacements.set(i, clearParagraph(slices[i].full));
  }

  return rebuildXml(xml, slices, replacements);
}

/** Validate that the DOCX summary was actually updated. */
export function validateDocxSummary(
  xml: string,
  expectedSummary: string,
  originalPlainText?: string,
  originalXmlSummary?: string | null,
): DocxSummaryValidation {
  const expected = sanitizeBulletText(expectedSummary);
  const patched = extractSummaryFromWordXml(xml);
  const originalSummary = originalPlainText
    ? extractSummaryText(originalPlainText)
    : originalXmlSummary ?? null;

  if (!expected) {
    return {
      passed: false,
      patchedSummary: patched,
      originalSummary,
      expectedSummary: expected,
      detail: 'no expected summary',
    };
  }

  if (!patched) {
    return {
      passed: false,
      patchedSummary: null,
      originalSummary,
      expectedSummary: expected,
      detail: 'summary section not found in DOCX',
    };
  }

  const patchedNorm = normalizeLine(patched);
  const expectedNorm = normalizeLine(expected);
  const origNorm = normalizeLine(originalSummary || '');

  if (patchedNorm === expectedNorm) {
    return {
      passed: true,
      patchedSummary: patched,
      originalSummary,
      expectedSummary: expected,
      detail: 'exact match',
    };
  }

  if (origNorm && patchedNorm === origNorm) {
    return {
      passed: false,
      patchedSummary: patched,
      originalSummary,
      expectedSummary: expected,
      detail: 'DOCX summary unchanged from original',
    };
  }

  const expWords = expected.split(/\s+/).filter((w) => w.length > 4);
  const hits = expWords.filter((w) => patched.toLowerCase().includes(w.toLowerCase())).length;
  const minHits = Math.min(10, Math.max(4, Math.ceil(expWords.length * 0.3)));
  const passed = hits >= minHits && patched.length >= Math.min(expected.length * 0.5, 120);

  return {
    passed,
    patchedSummary: patched,
    originalSummary,
    expectedSummary: expected,
    detail: passed ? `${hits} expected terms present` : `only ${hits}/${minHits} expected terms`,
  };
}

/** Patch summary using structure first; returns updated xml or null. */
export function patchSummaryInWordXmlStrong(
  xml: string,
  newSummary: string,
  originalPlainText?: string,
): { xml: string; validation: DocxSummaryValidation } | null {
  const expected = sanitizeBulletText(newSummary);
  if (!expected) return null;

  const origBefore = extractSummaryFromWordXml(xml);

  const next = replaceSummarySectionInWordXml(xml, expected);
  if (!next) return null;

  const validation = validateDocxSummary(next, expected, originalPlainText, origBefore);
  return { xml: next, validation };
}
