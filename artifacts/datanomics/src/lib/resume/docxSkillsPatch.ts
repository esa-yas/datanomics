import {
  findSkillsBlock,
  isSkillCategoryLine,
  isSkillsSectionHeading,
  skillCategoryName,
} from '@/lib/resume/resumeStructure';
import { countEnhancedSkillLines } from '@/lib/resume/skillsTailor';

export interface DocxSkillsValidation {
  passed: boolean;
  patchedSkills: string | null;
  originalSkills: string | null;
  expectedSkills: string | null;
  detail: string;
  enhancedLineCount: number;
}

const SKILLS_HEADING_RE = /^(CORE DATA|TECHNICAL SKILLS|CORE COMPETENCIES|KEY SKILLS|PROFESSIONAL SKILLS|SKILLS)/i;

interface ParagraphSlice {
  index: number;
  full: string;
  start: number;
  end: number;
  text: string;
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

function isSkillsHeading(text: string): boolean {
  return isSkillsSectionHeading(text) || (SKILLS_HEADING_RE.test(text.trim()) && text.trim().length <= 80);
}

function isSectionHeading(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 80) return false;
  if (/^(PROFESSIONAL SUMMARY|SUMMARY|PROFESSIONAL EXPERIENCE|EXPERIENCE|WORK EXPERIENCE|EDUCATION|CERTIFICATIONS|PROJECTS|AWARDS)$/i.test(t)) {
    return true;
  }
  return t === t.toUpperCase() && /[A-Z]/.test(t) && !t.includes('@') && !t.includes(':');
}

function findSkillsBodyRange(slices: ParagraphSlice[]): {
  bodyStart: number;
  bodyEnd: number;
} | null {
  let headingIdx = -1;
  for (let i = 0; i < slices.length; i++) {
    if (isSkillsHeading(slices[i].text)) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return null;

  let bodyStart = headingIdx + 1;
  while (bodyStart < slices.length && !slices[bodyStart].text.trim()) bodyStart++;

  let bodyEnd = bodyStart;
  while (bodyEnd < slices.length) {
    const t = slices[bodyEnd].text.trim();
    if (!t) {
      bodyEnd++;
      continue;
    }
    if (isSectionHeading(t) && !isSkillsHeading(t)) break;
    if (isSectionHeading(t) && bodyEnd > bodyStart) break;
    bodyEnd++;
  }

  return { bodyStart, bodyEnd: Math.max(bodyStart, bodyEnd) };
}

function normalizeSkills(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function skillsCategoryTextFromPlain(text: string): string | null {
  const block = findSkillsBlock(text);
  if (!block) return null;
  const lines = block.lines.filter((l) => isSkillCategoryLine(l.trim()) || l.includes(':'));
  return lines.map((l) => l.trim()).filter(Boolean).join('\n') || null;
}

/** Read skill category lines currently in Word XML. */
export function extractSkillsFromWordXml(xml: string): string | null {
  const slices = sliceParagraphs(xml);
  const range = findSkillsBodyRange(slices);
  if (!range) return null;

  const parts = slices
    .slice(range.bodyStart, range.bodyEnd)
    .map((s) => s.text.trim())
    .filter((t) => t && (t.includes(':') || isSkillCategoryLine(t)));
  return parts.join('\n') || null;
}

function newSkillTokensFromText(originalSkills: string, expectedSkills: string): string[] {
  const origSet = new Set(
    originalSkills
      .split('\n')
      .flatMap((line) => line.split(':').slice(1).join(':').split(/[,|·•/]/))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const tokens: string[] = [];
  for (const line of expectedSkills.split('\n')) {
    const after = line.split(':').slice(1).join(':');
    for (const seg of after.split(/[,|·•/]/)) {
      const t = seg.trim();
      if (t.length < 3) continue;
      const lower = t.toLowerCase();
      if (!origSet.has(lower)) tokens.push(t);
    }
  }
  return [...new Set(tokens)];
}

/** Validate that DOCX skills reflect tailored text keyword additions. */
export function validateDocxSkills(
  xml: string,
  originalText: string,
  tailoredText: string,
  jdText = '',
): DocxSkillsValidation {
  const originalSkills = skillsCategoryTextFromPlain(originalText);
  const expectedSkills = skillsCategoryTextFromPlain(tailoredText);
  const patchedSkills = extractSkillsFromWordXml(xml);
  const enhancedLineCount = countEnhancedSkillLines(originalText, tailoredText, jdText);

  if (!expectedSkills || !originalSkills) {
    return {
      passed: true,
      patchedSkills,
      originalSkills,
      expectedSkills,
      detail: 'no skills section',
      enhancedLineCount,
    };
  }

  if (normalizeSkills(originalSkills) === normalizeSkills(expectedSkills)) {
    return {
      passed: true,
      patchedSkills,
      originalSkills,
      expectedSkills,
      detail: 'skills unchanged in tailored text',
      enhancedLineCount,
    };
  }

  if (!patchedSkills) {
    return {
      passed: false,
      patchedSkills: null,
      originalSkills,
      expectedSkills,
      detail: 'skills section not found in DOCX',
      enhancedLineCount,
    };
  }

  const patchedNorm = normalizeSkills(patchedSkills);
  const origNorm = normalizeSkills(originalSkills);
  const expectedNorm = normalizeSkills(expectedSkills);

  if (patchedNorm === origNorm) {
    return {
      passed: false,
      patchedSkills,
      originalSkills,
      expectedSkills,
      detail: 'DOCX skills unchanged from original',
      enhancedLineCount,
    };
  }

  const newTokens = newSkillTokensFromText(originalSkills, expectedSkills);
  if (!newTokens.length) {
    return {
      passed: patchedNorm === expectedNorm,
      patchedSkills,
      originalSkills,
      expectedSkills,
      detail: patchedNorm === expectedNorm ? 'exact match' : 'skills differ but no new tokens',
      enhancedLineCount,
    };
  }

  const patchedLower = patchedSkills.toLowerCase();
  const hits = newTokens.filter((t) => patchedLower.includes(t.toLowerCase())).length;
  const minHits = Math.min(3, newTokens.length);
  const passed = hits >= minHits || patchedNorm === expectedNorm;

  return {
    passed,
    patchedSkills,
    originalSkills,
    expectedSkills,
    detail: passed
      ? `${hits}/${newTokens.length} new skill keywords in DOCX`
      : `only ${hits}/${minHits} new skill keywords in DOCX`,
    enhancedLineCount,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setParagraphText(pXml: string, text: string): string {
  const escaped = escapeXml(text);
  if (/<w:t[\s>]/.test(pXml)) {
    let first = true;
    return pXml.replace(/<w:t([^>]*)>([\s\S]*?)<\/w:t>/g, (_m, attrs) => {
      if (first) {
        first = false;
        const a = String(attrs).includes('xml:space') ? attrs : `${attrs} xml:space="preserve"`;
        return `<w:t${a}>${escaped}</w:t>`;
      }
      return `<w:t${attrs}></w:t>`;
    });
  }
  return pXml.replace(/<\/w:p>/, `<w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`);
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

/** Patch skill category lines in Word XML by matching category label prefix. */
export function patchSkillsInWordXml(
  xml: string,
  originalText: string,
  tailoredText: string,
): { xml: string; validation: DocxSkillsValidation } | null {
  const origBlock = findSkillsBlock(originalText);
  const tailBlock = findSkillsBlock(tailoredText);
  if (!origBlock || !tailBlock) return null;

  const slices = sliceParagraphs(xml);
  const range = findSkillsBodyRange(slices);
  if (!range) return null;

  const replacements = new Map<number, string>();
  let patchedAny = false;

  for (const origLine of origBlock.lines) {
    if (!isSkillCategoryLine(origLine)) continue;
    const cat = skillCategoryName(origLine);
    if (!cat) continue;

    const tailoredLine = tailBlock.lines.find(
      (l) => skillCategoryName(l)?.toLowerCase() === cat.toLowerCase(),
    );
    if (!tailoredLine || tailoredLine === origLine) continue;

    const catPrefix = `${cat}:`;
    for (let i = range.bodyStart; i < range.bodyEnd; i++) {
      const slice = slices[i];
      if (!slice.text.includes(':')) continue;
      if (
        slice.text.toLowerCase().startsWith(catPrefix.toLowerCase()) ||
        normalizeSkills(slice.text).startsWith(normalizeSkills(catPrefix))
      ) {
        replacements.set(i, setParagraphText(slice.full, tailoredLine));
        patchedAny = true;
        break;
      }
    }
  }

  if (!patchedAny) return null;

  const next = rebuildXml(xml, slices, replacements);
  const validation = validateDocxSkills(next, originalText, tailoredText);
  return { xml: next, validation };
}
