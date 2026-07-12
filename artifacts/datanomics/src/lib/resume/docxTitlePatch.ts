import { isJobMetadataLine, sanitizeBulletText } from '@/lib/resume/resumeLines';
import {
  buildExpectedDocxHeaderLines,
  buildFormattedHeaderUpdate,
  detectHeaderPattern,
  extractHeaderLocation,
  formattedHeadlineLine,
  parseContactSegments,
  type HeaderLineRole,
} from '@/lib/resume/resumeHeaderFormat';
import { extractOriginalCertificationLinesFromText } from '@/lib/resume/sourceResumeSnapshot';
import {
  getResumeHeadline,
  isHeaderContactLine,
  isLikelyJobTitleLine,
  isMultiTitleHeadline,
  isSectionHeading,
  lineInOriginalExperienceSection,
  normalizeLine,
  parseHeaderRegion,
  parseResumeStructure,
  extractExperienceRoleTitleLines,
} from '@/lib/resume/resumeStructure';

export interface DocxTitleValidation {
  passed: boolean;
  detail: string;
  strayLocations: string[];
  hasTitleLine: boolean;
  hasLocation: boolean;
  hasContactLine: boolean;
  certsPreserved: boolean;
  emptyBulletCount: number;
  titleLineCount: number;
  contactLineCount: number;
  headerOrderValid: boolean;
  nameFirst: boolean;
  headerExtraLines: number;
  oldTitleLeaked: boolean;
  headerBlockExact: boolean;
  titleDuplicated: boolean;
  headerTypographyOk: boolean;
  headerBodySpacerOk: boolean;
  experienceRoleTitlesOk: boolean;
}

interface ParagraphSlice {
  index: number;
  full: string;
  start: number;
  end: number;
  text: string;
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

function rebuildXml(xml: string, slices: ParagraphSlice[], replacements: Map<number, string>): string {
  let out = '';
  let last = 0;
  for (const slice of slices) {
    out += xml.slice(last, slice.start);
    const repl = replacements.get(slice.index);
    if (repl !== undefined) {
      if (repl) out += repl;
    } else {
      out += slice.full;
    }
    last = slice.end;
  }
  out += xml.slice(last);
  return out;
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

/** Word font sizes are half-points: 13pt → 26, 12pt → 24, 11pt → 22. */
const HEADER_STYLE: Record<HeaderLineRole, { halfPt: number; bold: boolean }> = {
  name: { halfPt: 26, bold: true },
  title: { halfPt: 24, bold: true },
  contact: { halfPt: 22, bold: false },
};

function headerRunPropertiesXml(role: HeaderLineRole): string {
  const { halfPt, bold } = HEADER_STYLE[role];
  const boldXml = bold ? '<w:b/><w:bCs/>' : '';
  return `${boldXml}<w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/>`;
}

/**
 * One explicit run per header paragraph — no inherited pStyle/Heading1 or mixed run sizes.
 */
function createStyledHeaderParagraph(
  text: string,
  role: HeaderLineRole,
  spacingAfter?: number,
): string {
  const rPr = headerRunPropertiesXml(role);
  const spacingXml = spacingAfter
    ? `<w:spacing w:after="${spacingAfter}" w:lineRule="auto"/>`
    : '';
  const pPr = spacingXml ? `<w:pPr>${spacingXml}</w:pPr>` : '<w:pPr/>';
  return `<w:p>${pPr}<w:r><w:rPr>${rPr}</w:rPr><w:t xml:space="preserve">${escapeXml(sanitizeBulletText(text))}</w:t></w:r></w:p>`;
}

function buildStyledHeaderParagraph(text: string, role: HeaderLineRole, spacingAfter?: number): string {
  return createStyledHeaderParagraph(text, role, spacingAfter);
}

/** Blank paragraph between header block and first section heading. */
function createHeaderBodySpacerParagraph(): string {
  return `<w:p><w:pPr><w:spacing w:after="120" w:lineRule="auto"/></w:pPr><w:r><w:t></w:t></w:r></w:p>`;
}

function paragraphHasSingleStyledRun(pXml: string, role: HeaderLineRole): boolean {
  if (/<w:pStyle/i.test(pXml)) return false;

  const runs = [...pXml.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)];
  const textRuns = runs.filter((m) => /<w:t[\s>]/.test(m[1]));
  if (textRuns.length !== 1) return false;

  const inner = textRuns[0][1];
  const { halfPt, bold } = HEADER_STYLE[role];
  const sizes = [...inner.matchAll(/<w:sz w:val="(\d+)"/g)].map((m) => Number(m[1]));
  if (!sizes.length || sizes.some((s) => s !== halfPt)) return false;

  const hasBold = /<w:b\b|<w:b\/>/.test(inner);
  return hasBold === bold;
}

export function validateHeaderParagraphTypography(
  xml: string,
  expected: string[],
  lineRoles: HeaderLineRole[],
): boolean {
  const slices = sliceParagraphs(xml);
  const sectionIdx = firstSectionParagraphIndex(slices);
  let headerIdx = 0;

  for (let i = 0; i < sectionIdx && headerIdx < expected.length; i++) {
    const t = slices[i].text.trim();
    if (!t) continue;
    const role = lineRoles[headerIdx] ?? 'title';
    if (!paragraphHasSingleStyledRun(slices[i].full, role)) return false;
    headerIdx++;
  }

  return headerIdx === expected.length;
}

export function hasHeaderBodySpacer(xml: string, headerLineCount: number): boolean {
  const slices = sliceParagraphs(xml);
  const sectionIdx = firstSectionParagraphIndex(slices);
  if (sectionIdx <= 0) return false;

  let nonEmptySeen = 0;
  let lastHeaderSliceIdx = -1;

  for (let i = 0; i < sectionIdx; i++) {
    const t = slices[i].text.trim();
    if (!t) continue;
    nonEmptySeen++;
    if (nonEmptySeen === headerLineCount) {
      lastHeaderSliceIdx = i;
      break;
    }
  }

  if (lastHeaderSliceIdx < 0) return false;

  for (let j = lastHeaderSliceIdx + 1; j < sectionIdx; j++) {
    if (!slices[j].text.trim()) return true;
  }

  const afterMatch = slices[lastHeaderSliceIdx].full.match(/w:after="(\d+)"/);
  return !!(afterMatch && Number(afterMatch[1]) >= 120);
}

export function experienceRoleTitlesPreservedInDoc(originalText: string, slices: ParagraphSlice[]): boolean {
  const required = extractExperienceRoleTitleLines(originalText);
  if (!required.length) return true;

  const experienceNorms = new Set<string>();
  let inExp = false;

  for (const s of slices) {
    const t = s.text.trim();
    if (!t) continue;
    if (/^(PROFESSIONAL )?EXPERIENCE|WORK EXPERIENCE$/i.test(t)) {
      inExp = true;
      continue;
    }
    if (inExp && isSectionHeading(t) && !/EXPERIENCE/i.test(t)) break;
    if (inExp) experienceNorms.add(normalizeLine(t));
  }

  return required.every((title) => experienceNorms.has(normalizeLine(title)));
}

function metadataLineAfterRoleTitle(originalText: string, roleTitle: string): string | null {
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

/** Re-insert experience role title lines removed by stray-title cleanup or AI tailoring. */
export function ensureExperienceRoleTitlesFromSource(
  xml: string,
  sourceXml: string,
  originalText: string,
): string {
  const required = extractExperienceRoleTitleLines(originalText);
  if (!required.length) return xml;

  const sourceSlices = sliceParagraphs(sourceXml);
  let slices = sliceParagraphs(xml);
  const experienceNorms = new Set<string>();
  let inExp = false;

  for (const s of slices) {
    const t = s.text.trim();
    if (!t) continue;
    if (/^(PROFESSIONAL )?EXPERIENCE|WORK EXPERIENCE$/i.test(t)) {
      inExp = true;
      continue;
    }
    if (inExp && isSectionHeading(t) && !/EXPERIENCE/i.test(t)) break;
    if (inExp) experienceNorms.add(normalizeLine(t));
  }

  const missing = required.filter((title) => !experienceNorms.has(normalizeLine(title)));
  if (!missing.length) return xml;

  for (const title of missing) {
    const meta = metadataLineAfterRoleTitle(originalText, title);
    if (!meta) continue;

    const metaNorm = normalizeLine(meta);
    let insertPos = -1;
    let inExpSection = false;
    for (const s of slices) {
      const t = s.text.trim();
      if (t && /^(PROFESSIONAL )?EXPERIENCE|WORK EXPERIENCE$/i.test(t)) {
        inExpSection = true;
        continue;
      }
      if (inExpSection && t && normalizeLine(t) === metaNorm) {
        insertPos = s.start;
        break;
      }
    }
    if (insertPos < 0) continue;

    const titleNorm = normalizeLine(title);
    const paraXml =
      sourceSlices.find((s) => normalizeLine(s.text) === titleNorm)?.full ??
      createSimpleParagraph(title);
    xml = xml.slice(0, insertPos) + paraXml + xml.slice(insertPos);
    slices = sliceParagraphs(xml);
  }

  return xml;
}

/** Delete the paragraph entirely — avoids empty bullet markers. */
function deleteParagraph(_pXml: string): string {
  return '';
}

function isListParagraph(pXml: string): boolean {
  return /<w:numPr[\s>]/.test(pXml) || /<w:pStyle[^>]+w:val="ListParagraph"/i.test(pXml);
}

function isEmptyParagraph(slice: ParagraphSlice): boolean {
  return !slice.text.trim();
}

/** Norms that must only appear on the approved header title line. */
export function collectForbiddenTitleNorms(
  originalText: string,
  suggestedTitle?: string,
): Set<string> {
  const norms = new Set<string>();
  const add = (s: string) => {
    const n = normalizeLine(s);
    if (n.length >= 8) norms.add(n);
  };

  const origHeadline = getResumeHeadline(originalText);
  if (origHeadline) add(origHeadline);

  if (suggestedTitle?.trim()) {
    const formatted = formattedHeadlineLine(originalText, suggestedTitle);
    if (formatted) add(formatted);
    add(suggestedTitle);
    for (const seg of suggestedTitle.split('|')) {
      const s = seg.trim();
      if (s.length >= 10) add(s);
    }
  }

  return norms;
}

function firstSectionParagraphIndex(slices: ParagraphSlice[]): number {
  for (let i = 0; i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (t && isSectionHeading(t)) return i;
  }
  return slices.length;
}

/** Locate the first body section heading using reference resume text, then XML heuristics. */
function findSectionStartParagraphIndex(slices: ParagraphSlice[], referenceText?: string): number {
  if (referenceText?.trim()) {
    const headings = parseResumeStructure(referenceText).sectionHeadings;
    for (const heading of headings) {
      const target = normalizeLine(heading);
      for (let i = 0; i < slices.length; i++) {
        const t = slices[i].text.trim();
        if (!t) continue;
        if (normalizeLine(t) === target) return i;
      }
    }
  }
  return firstSectionParagraphIndex(slices);
}

function isLineInHeaderRegion(text: string, line: string): boolean {
  const target = normalizeLine(line);
  if (!target) return false;
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    if (normalizeLine(t) === target) return true;
  }
  return false;
}

export { isLineInHeaderRegion };

function isStrayTitleParagraph(
  text: string,
  forbiddenNorms: Set<string>,
  approvedHeadlineNorm: string | null,
  originalText: string,
): boolean {
  const t = text.trim();
  if (!t) return false;
  const norm = normalizeLine(t);

  // Never remove original experience role titles (often overlap suggested-title keywords).
  if (lineInOriginalExperienceSection(originalText, t)) return false;

  if (approvedHeadlineNorm && norm === approvedHeadlineNorm) return false;
  if (forbiddenNorms.has(norm)) return true;
  if (isMultiTitleHeadline(t)) {
    for (const f of forbiddenNorms) {
      if (f.includes('|') && norm === f) return true;
      if (norm.split('|').length >= 2 && forbiddenNorms.size > 0) {
        const segs = norm.split('|').map((s) => s.trim()).filter(Boolean);
        const titleLike = segs.filter(
          (s) => s.length > 8 && /analyst|engineer|developer|consultant|specialist|architect/i.test(s),
        );
        if (titleLike.length >= 2) return true;
      }
    }
  }
  return false;
}

function findHeaderTitleParagraphIndex(
  slices: ParagraphSlice[],
  originalText: string,
  sectionStart: number,
): number {
  const origTitle = getResumeHeadline(originalText);
  const origTitleNorm = origTitle ? normalizeLine(origTitle) : null;

  for (let i = 0; i < sectionStart; i++) {
    if (origTitleNorm && normalizeLine(slices[i].text) === origTitleNorm) return i;
  }

  const header = parseHeaderRegion(originalText);
  const headerParas = slices.slice(0, sectionStart).filter((s) => s.text.trim());

  for (const s of headerParas) {
    if (isMultiTitleHeadline(s.text)) return s.index;
  }

  for (const s of headerParas) {
    const t = s.text.trim();
    if (isHeaderContactLine(t)) continue;
    if (t.includes('|') || isLikelyJobTitleLine(t)) return s.index;
  }

  if (header?.contactBeforeTitle && headerParas.length >= 2) {
    return headerParas[headerParas.length - 1].index;
  }
  if (headerParas.length >= 3) {
    return headerParas[1].index;
  }
  if (headerParas.length === 2) {
    const second = headerParas[1];
    if (!isHeaderContactLine(second.text)) return second.index;
  }

  return -1;
}

function findHeaderContactParagraphIndex(
  slices: ParagraphSlice[],
  originalText: string,
  sectionStart: number,
): number {
  const header = parseHeaderRegion(originalText);
  const lines = originalText.split('\n');
  const origContact = header?.contactIdx != null ? lines[header.contactIdx]?.trim() : '';
  const origContactNorm = origContact ? normalizeLine(origContact) : null;

  if (origContactNorm) {
    for (let i = 0; i < sectionStart; i++) {
      if (normalizeLine(slices[i].text) === origContactNorm) return i;
    }
  }

  for (let i = 0; i < sectionStart; i++) {
    if (isHeaderContactLine(slices[i].text)) return i;
  }
  return -1;
}

/** Find body paragraphs containing the suggested title outside the header. */
export function findStrayTitleParagraphs(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
): { index: number; text: string; sectionHint: string }[] {
  const slices = sliceParagraphs(xml);
  const forbidden = collectForbiddenTitleNorms(originalText, suggestedTitle);
  const approvedNorm =
    suggestedTitle && formattedHeadlineLine(originalText, suggestedTitle)
      ? normalizeLine(formattedHeadlineLine(originalText, suggestedTitle)!)
      : null;

  const sectionStart = firstSectionParagraphIndex(slices);
  const strays: { index: number; text: string; sectionHint: string }[] = [];
  const origCertNorms = new Set(originalCertificationLines(originalText).map(normalizeLine));
  let currentSection = 'body';

  for (let i = 0; i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (t && isSectionHeading(t)) currentSection = t.slice(0, 40);

    // Never touch header paragraphs — only remove stray titles from the body.
    if (i < sectionStart) continue;
    if (origCertNorms.has(normalizeLine(t))) continue;
    if (isStrayTitleParagraph(t, forbidden, approvedNorm, originalText)) {
      strays.push({ index: i, text: t, sectionHint: currentSection });
    }
  }

  return strays;
}

/** Remove stray title paragraphs from the body — deletes the whole paragraph/bullet. */
export function removeStrayTitleFromWordXml(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
): string {
  const strays = findStrayTitleParagraphs(xml, originalText, suggestedTitle);
  if (!strays.length) return xml;

  const slices = sliceParagraphs(xml);
  const replacements = new Map<number, string>();
  for (const stray of strays) {
    replacements.set(stray.index, deleteParagraph(slices[stray.index].full));
  }
  return rebuildXml(xml, slices, replacements);
}

/** Patch only the header title paragraph — inserts a new line if the slot is missing. */
export function patchHeadlineInWordXml(
  xml: string,
  originalText: string,
  suggestedTitle: string,
): string | null {
  const newTitle = formattedHeadlineLine(originalText, suggestedTitle);
  if (!newTitle) return null;

  const slices = sliceParagraphs(xml);
  const sectionStart = firstSectionParagraphIndex(slices);
  let targetIdx = findHeaderTitleParagraphIndex(slices, originalText, sectionStart);

  if (targetIdx < 0) {
    const header = parseHeaderRegion(originalText);
    const nameIdx = slices.slice(0, sectionStart).findIndex((s) => s.text.trim());
    const contactIdx = findHeaderContactParagraphIndex(slices, originalText, sectionStart);
    const templateIdx = nameIdx >= 0 ? nameIdx : 0;
    const template = getSliceAt(slices, templateIdx);
    if (!template) return null;
    const newPara = setParagraphText(template.full, sanitizeBulletText(newTitle));
    let insertPos: number;
    const contactSlice = contactIdx >= 0 ? getSliceAt(slices, contactIdx) : undefined;
    if (header?.contactBeforeTitle && contactSlice) {
      insertPos = contactSlice.end;
    } else if (contactSlice) {
      insertPos = contactSlice.start;
    } else {
      insertPos = template.end;
    }
    return xml.slice(0, insertPos) + newPara + xml.slice(insertPos);
  }

  if (targetIdx >= sectionStart) return null;

  const targetSlice = getSliceAt(slices, targetIdx);
  if (!targetSlice) return null;

  const currentNorm = normalizeLine(targetSlice.text);
  const newNorm = normalizeLine(newTitle);
  if (currentNorm === newNorm) return null;

  const replacements = new Map<number, string>();
  replacements.set(
    targetIdx,
    setParagraphText(targetSlice.full, sanitizeBulletText(newTitle)),
  );
  return rebuildXml(xml, slices, replacements);
}

/** Ensure contact row includes location from the original resume header. */
export function patchContactLocationInWordXml(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
): string | null {
  const location = extractHeaderLocation(originalText);
  if (!location) return null;

  const update = suggestedTitle?.trim()
    ? buildFormattedHeaderUpdate(originalText, suggestedTitle)
    : null;
  const lines = originalText.split('\n');
  const header = parseHeaderRegion(originalText);
  const contactIdx = header?.contactIdx;
  const originalContact = contactIdx != null ? lines[contactIdx]?.trim() || '' : '';
  if (!originalContact) return null;

  const expectedContact =
    update?.contactLine ??
    (parseContactSegments(originalContact).location
      ? originalContact
      : `${location} | ${originalContact}`);

  if (normalizeLine(expectedContact) === normalizeLine(originalContact)) return null;

  const slices = sliceParagraphs(xml);
  const sectionStart = firstSectionParagraphIndex(slices);
  const targetIdx = findHeaderContactParagraphIndex(slices, originalText, sectionStart);
  if (targetIdx < 0) return null;

  const targetSlice = getSliceAt(slices, targetIdx);
  if (!targetSlice) return null;

  const replacements = new Map<number, string>();
  replacements.set(
    targetIdx,
    setParagraphText(targetSlice.full, sanitizeBulletText(expectedContact)),
  );
  return rebuildXml(xml, slices, replacements);
}

/** Remove empty list paragraphs left after stray-title deletion. */
export function removeEmptyBulletParagraphsFromWordXml(xml: string): string {
  const slices = sliceParagraphs(xml);
  const replacements = new Map<number, string>();
  for (const slice of slices) {
    if (isEmptyParagraph(slice) && isListParagraph(slice.full)) {
      replacements.set(slice.index, deleteParagraph(slice.full));
    }
  }
  if (!replacements.size) return xml;
  return rebuildXml(xml, slices, replacements);
}

function createSimpleParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(sanitizeBulletText(text))}</w:t></w:r></w:p>`;
}

function getSliceAt(slices: ParagraphSlice[], idx: number): ParagraphSlice | undefined {
  if (idx < 0 || idx >= slices.length) return undefined;
  return slices[idx];
}

function headerRolesInXml(
  slices: ParagraphSlice[],
  sectionStart: number,
): { nameIdx: number; titleIdx: number; contactIdx: number } {
  let nameIdx = -1;
  let titleIdx = -1;
  let contactIdx = -1;

  for (let i = 0; i < sectionStart && i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (!t) continue;
    if (nameIdx < 0) nameIdx = i;
    if (isHeaderContactLine(t)) {
      contactIdx = i;
      continue;
    }
    if (titleIdx < 0 && (isMultiTitleHeadline(t) || isLikelyJobTitleLine(t))) {
      titleIdx = i;
    }
  }

  if (titleIdx < 0) {
    for (let i = 0; i < sectionStart && i < slices.length; i++) {
      if (i === nameIdx || i === contactIdx) continue;
      const t = slices[i].text.trim();
      if (t.includes('|') && !isHeaderContactLine(t)) {
        titleIdx = i;
        break;
      }
    }
  }

  return { nameIdx, titleIdx, contactIdx };
}

/** True when every original certification line still exists in document text. */
export function certificationsPreserved(originalText: string, docText: string): boolean {
  const origCerts = originalCertificationLines(originalText);
  if (!origCerts.length) return true;
  const docLower = docText.toLowerCase();
  return origCerts.every((cert) => {
    const norm = normalizeLine(cert);
    if (docLower.includes(norm)) return true;
    const core = norm.replace(/[^a-z0-9&]+/g, ' ').trim();
    if (core.length >= 12 && docLower.includes(core)) return true;
    return docText.split('\n').some((l) => normalizeLine(l) === norm);
  });
}

function isCertSectionHeading(text: string): boolean {
  return isSectionHeading(text) && /CERTIFICATION/i.test(text);
}

function findCertSectionBlock(slices: ParagraphSlice[]): {
  headingIdx: number;
  bodyStartIdx: number;
  bodyEndIdx: number;
  bodySlices: ParagraphSlice[];
} | null {
  for (let i = 0; i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (!isCertSectionHeading(t)) continue;

    const bodySlices: ParagraphSlice[] = [];
    let bodyEndIdx = i + 1;
    for (let j = i + 1; j < slices.length; j++) {
      const u = slices[j].text.trim();
      if (u && isSectionHeading(u) && !isCertSectionHeading(u)) break;
      bodyEndIdx = j + 1;
      if (u) bodySlices.push(slices[j]);
    }
    return { headingIdx: i, bodyStartIdx: i + 1, bodyEndIdx, bodySlices };
  }
  return null;
}

function certLineMatches(paragraphNorm: string, certNorm: string): boolean {
  if (!paragraphNorm || !certNorm) return false;
  if (paragraphNorm === certNorm) return true;

  const minOverlap = Math.min(24, Math.floor(certNorm.length * 0.55));
  if (paragraphNorm.includes(certNorm) || certNorm.includes(paragraphNorm)) {
    const shorter = paragraphNorm.length <= certNorm.length ? paragraphNorm : certNorm;
    return shorter.length >= minOverlap;
  }

  const core = certNorm.replace(/[^a-z0-9&]+/g, ' ').trim();
  if (core.length >= 12 && (paragraphNorm.includes(core) || core.includes(paragraphNorm))) {
    const shorter = paragraphNorm.length <= core.length ? paragraphNorm : core;
    return shorter.length >= Math.min(24, Math.floor(core.length * 0.55));
  }
  return false;
}

function certificationParagraphSlices(slices: ParagraphSlice[]): ParagraphSlice[] {
  const block = findCertSectionBlock(slices);
  if (block) return block.bodySlices;

  const out: ParagraphSlice[] = [];
  for (let i = 0; i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (!isSectionHeading(t) || !/EDUCATION|CERTIFICATION/i.test(t)) continue;
    for (let j = i + 1; j < slices.length; j++) {
      const u = slices[j].text.trim();
      if (u && isSectionHeading(u)) break;
      if (
        u &&
        /certification|certified|certificate|salesforce|aws certified|azure|google cloud|pmp|csm|cpa|pl-300/i.test(
          u,
        )
      ) {
        out.push(slices[j]);
      }
    }
    if (out.length) return out;
  }
  return out;
}

function certTextPresent(norm: string, slices: ParagraphSlice[]): boolean {
  const certSlices = certificationParagraphSlices(slices);
  const searchIn = certSlices.length ? certSlices : slices;
  for (const s of searchIn) {
    const sn = normalizeLine(s.text);
    if (!sn) continue;
    if (certLineMatches(sn, norm)) return true;
  }
  return false;
}

export { buildExpectedDocxHeaderLines, detectHeaderPattern } from '@/lib/resume/resumeHeaderFormat';

/**
 * Determine whether a header paragraph is "stale" and should be replaced.
 *
 * BUG FIX (header duplication): The original implementation returned true for any
 * paragraph whose norm matched an expectedNorm. But the expected lines ARE the lines
 * we are about to write — marking them as stale caused them to be included in the
 * "replace zone" and then written again, producing duplicates.
 *
 * Fixed: a paragraph is stale only when it is NOT one of the expected lines AND it
 * looks like a header artifact (contact, title, or name that does not belong in body).
 */
function isStaleHeaderParagraph(
  text: string,
  originalText: string,
  expectedNorms: Set<string>,
): boolean {
  const t = text.trim();
  // Blank paragraphs in the header zone are consumed during replacement
  if (!t) return true;
  // Never mark a section heading as stale — it is the boundary marker
  if (isSectionHeading(t)) return false;

  const n = normalizeLine(t);

  // FIX: if this line is already the correct expected content, it is NOT stale.
  // We will overwrite the whole block atomically, so don't expand the zone just
  // because the line happens to match something we're going to write.
  if (expectedNorms.has(n)) return false;

  // A paragraph that matches the original (pre-tailoring) title is stale
  const origTitle = getResumeHeadline(originalText);
  if (origTitle && n === normalizeLine(origTitle)) return true;

  // Pattern: original name line appearing somewhere other than slot 0 is stale
  const pattern = detectHeaderPattern(originalText);
  if (pattern && n === normalizeLine(pattern.nameLine)) return true;

  // Contact lines and title lines that are NOT in the expected set are stale header artifacts
  if (isHeaderContactLine(t)) return true;
  if (isMultiTitleHeadline(t) || isLikelyJobTitleLine(t)) return true;

  // Name-like single line (no pipes, not a section heading, short)
  if (!t.includes('|') && t.length <= 70) return true;

  return false;
}

/**
 * Index of the first body paragraph — end of the header block to replace.
 *
 * BUG FIX (header over-counting): The original implementation used Math.max() across
 * bodyIdx, sourceBodyIdx, scanEnd, minLines, and expected.length. When scanEnd extended
 * past the real section heading because isStaleHeaderParagraph was too greedy, the
 * replacement zone swallowed the first body paragraph (e.g. "PROFESSIONAL SUMMARY"),
 * causing it to be deleted and the first cert line to shift up and be misidentified.
 *
 * Fixed: cap the replacement zone at the first section heading found by XML scan.
 * Never go past a section heading regardless of other heuristics.
 */
function findHeaderReplaceEnd(
  slices: ParagraphSlice[],
  originalText: string,
  expected: string[],
  sourceSlices: ParagraphSlice[] | null,
): number {
  // Hard ceiling: never replace past the first XML section heading
  const xmlSectionHeadingIdx = firstSectionParagraphIndex(slices);

  const pattern = detectHeaderPattern(originalText);
  const expectedNorms = new Set(expected.map(normalizeLine));

  // Scan forward from the start and mark everything that looks like a stale header artifact.
  // Stop as soon as we hit the XML section heading (hard ceiling).
  let scanEnd = 0;
  for (let i = 0; i < xmlSectionHeadingIdx && i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (t && isSectionHeading(t)) break; // redundant safety check
    if (isStaleHeaderParagraph(t, originalText, expectedNorms)) {
      scanEnd = i + 1;
    } else {
      // Non-stale, non-section content before the heading → include it in the zone
      // only if we haven't yet exceeded the known header line count
      const maxHeaderLines = pattern?.originalLineCount ?? expected.length;
      if (i < maxHeaderLines) {
        scanEnd = i + 1;
      } else {
        break;
      }
    }
  }

  // The replacement zone must be at least as large as the expected header
  const minEnd = Math.min(expected.length, xmlSectionHeadingIdx);

  // If there is a source DOCX, factor in its body start as well
  const sourceBodyIdx = sourceSlices ? docxBodyStartIndex(sourceSlices, originalText) : 0;
  const candidateEnd = Math.max(scanEnd, minEnd, sourceBodyIdx);

  // Final cap: never exceed the XML section heading index
  return Math.min(candidateEnd, xmlSectionHeadingIdx);
}

/** First body section paragraph — XML heading first, then original text headings, then header-size heuristic. */
function docxBodyStartIndex(slices: ParagraphSlice[], originalText: string): number {
  const fromXml = firstSectionParagraphIndex(slices);
  if (fromXml < slices.length) return fromXml;

  for (const heading of parseResumeStructure(originalText).sectionHeadings) {
    const target = normalizeLine(heading);
    for (let i = 0; i < slices.length; i++) {
      const t = slices[i].text.trim();
      if (t && normalizeLine(t) === target) return i;
    }
  }

  const headerCount = parseResumeStructure(originalText).headerLines.length;
  return Math.min(slices.length, Math.max(headerCount + 2, 6));
}

function headerLinesBeforeFirstSection(slices: ParagraphSlice[]): string[] {
  const out: string[] = [];
  for (const s of slices) {
    const t = s.text.trim();
    if (!t) continue;
    if (isSectionHeading(t)) break;
    out.push(t);
  }
  return out;
}

function getActualDocxHeaderLines(
  slices: ParagraphSlice[],
  originalText: string,
  expected: string[],
  sourceSlices: ParagraphSlice[] | null = null,
  forReplacement = false,
): string[] {
  if (forReplacement) {
    const sectionEnd = findHeaderReplaceEnd(slices, originalText, expected, sourceSlices);
    return slices.slice(0, sectionEnd).map((s) => s.text.trim()).filter(Boolean);
  }
  return headerLinesBeforeFirstSection(slices);
}

function headerBlockMatchesExpected(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length || !expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (normalizeLine(actual[i]) !== normalizeLine(expected[i])) return false;
  }
  return true;
}

function findHeaderTemplateParagraph(
  slices: ParagraphSlice[],
  sectionEnd: number,
  nameLine: string,
): string | null {
  const nameNorm = nameLine ? normalizeLine(nameLine) : '';
  for (let i = 0; i < sectionEnd && i < slices.length; i++) {
    if (nameNorm && normalizeLine(slices[i].text) === nameNorm) return slices[i].full;
  }
  for (let i = 0; i < sectionEnd && i < slices.length; i++) {
    if (slices[i].text.trim()) return slices[i].full;
  }
  return slices[0]?.full ?? null;
}

/** Expected header lines — prefer buildExpectedDocxHeaderLines(originalText, suggestedTitle). */
export function getExpectedHeaderLines(originalText: string, suggestedTitle?: string): string[] {
  return buildExpectedDocxHeaderLines(originalText, suggestedTitle);
}

/**
 * Replace every paragraph before the first section heading in document.xml with exactly
 * the expected header block — no line-by-line patching.
 *
 * This is the authoritative header replacement path. It operates on a protected block:
 * it reads the expected lines from originalText + suggestedTitle, then atomically
 * replaces the header zone in the DOCX XML. It never patches line-by-line.
 */
export function replaceDocxHeaderBlock(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
  sourceXml?: string,
  expectedOverride?: string[],
): string {
  const expected = expectedOverride?.length
    ? expectedOverride
    : buildExpectedDocxHeaderLines(originalText, suggestedTitle);
  if (!expected.length) return xml;

  const slices = sliceParagraphs(xml);
  if (!slices.length) return xml;

  const sourceSlices = sourceXml ? sliceParagraphs(sourceXml) : null;
  const pattern = detectHeaderPattern(originalText);
  const sectionEnd = findHeaderReplaceEnd(slices, originalText, expected, sourceSlices);
  const lineRoles = pattern?.lineOrder ?? expected.map((_, i) => (i === 0 ? 'name' : i === 1 ? 'title' : 'contact') as HeaderLineRole);

  const headerParagraphs = expected.map((line, i) => {
    const role = lineRoles[i] ?? 'title';
    const isLast = i === expected.length - 1;
    return buildStyledHeaderParagraph(line, role, isLast ? 200 : undefined);
  });

  const newHeaderXml = headerParagraphs.join('') + createHeaderBodySpacerParagraph();

  if (sectionEnd === 0 && slices[0]?.text.trim() && isSectionHeading(slices[0].text.trim())) {
    return xml.slice(0, slices[0].start) + newHeaderXml + xml.slice(slices[0].start);
  }

  const headerStart = slices[0].start;
  const headerEnd =
    sectionEnd < slices.length ? slices[sectionEnd].start : slices[slices.length - 1].end;

  return xml.slice(0, headerStart) + newHeaderXml + xml.slice(headerEnd);
}

/** @deprecated Use replaceDocxHeaderBlock */
export function normalizeHeaderInWordXml(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
): string {
  return replaceDocxHeaderBlock(xml, originalText, suggestedTitle);
}

function certificationsPresentInDoc(originalText: string, slices: ParagraphSlice[]): boolean {
  const origCerts = originalCertificationLines(originalText);
  if (!origCerts.length) return true;
  return origCerts.every((cert) => certTextPresent(normalizeLine(cert), slices));
}

function findCertInsertPosition(slices: ParagraphSlice[]): number {
  const block = findCertSectionBlock(slices);
  if (block) {
    if (block.bodySlices.length) return block.bodySlices[block.bodySlices.length - 1].end;
    return slices[block.headingIdx].end;
  }

  for (let i = 0; i < slices.length; i++) {
    const t = slices[i].text.trim();
    if (!isSectionHeading(t) || !/EDUCATION|CERTIFICATION/i.test(t)) continue;
    let insertAfter = slices[i].end;
    for (let j = i + 1; j < slices.length; j++) {
      const u = slices[j].text.trim();
      if (u && isSectionHeading(u)) break;
      insertAfter = slices[j].end;
    }
    return insertAfter;
  }

  return -1;
}

function sourceParagraphForCert(sourceSlices: ParagraphSlice[], cert: string): string | null {
  const norm = normalizeLine(cert);
  const core = norm.replace(/[^a-z0-9&]+/g, ' ').trim();
  for (const s of sourceSlices) {
    const sn = normalizeLine(s.text);
    if (!sn) continue;
    if (sn === norm || sn.includes(norm) || norm.includes(sn)) return s.full;
    if (core.length >= 8 && (sn.includes(core) || core.includes(sn))) return s.full;
  }
  return null;
}

/**
 * Ensure every original certification paragraph exists in the final document.xml.
 *
 * BUG FIX (first cert lost): The original code computed insertPos from findCertInsertPosition()
 * BEFORE inserting the CERTIFICATIONS heading paragraph. After the heading was inserted, the
 * insertPos byte offset pointed to a location that was now inside the heading XML, not after it.
 * The first cert was then inserted at the wrong position (or lost entirely on some XML layouts).
 *
 * Fix: re-compute insertPos from fresh slices AFTER inserting the heading, and derive it from
 * the heading's actual end position rather than from the pre-mutation offset.
 */
export function ensureCertificationsFromSource(
  xml: string,
  sourceXml: string,
  originalText: string,
): string {
  const origCerts = originalCertificationLines(originalText);
  if (!origCerts.length) return xml;

  const sourceSlices = sliceParagraphs(sourceXml);
  let slices = sliceParagraphs(xml);
  const missing = origCerts.filter((c) => !certTextPresent(normalizeLine(c), slices));
  if (!missing.length) return xml;

  // ── Step 1: find or create the CERTIFICATIONS section heading ──────────────
  let block = findCertSectionBlock(slices);

  if (!block) {
    // Find the best place to insert the heading
    let headingInsertPos = findCertInsertPosition(slices);
    if (headingInsertPos < 0) {
      for (let i = slices.length - 1; i >= 0; i--) {
        const t = slices[i].text.trim();
        if (isSectionHeading(t) && /EDUCATION|EXPERIENCE|SKILLS/i.test(t)) {
          headingInsertPos = slices[i].end;
          break;
        }
      }
    }
    if (headingInsertPos < 0) headingInsertPos = slices[slices.length - 1]?.end ?? xml.length;

    const headingPara =
      sourceSlices.find((s) => isCertSectionHeading(s.text.trim()))?.full ??
      createSimpleParagraph('CERTIFICATIONS');

    xml = xml.slice(0, headingInsertPos) + headingPara + xml.slice(headingInsertPos);

    // Re-parse after heading insertion so all offsets are correct
    slices = sliceParagraphs(xml);
    block = findCertSectionBlock(slices);
  }

  // ── Step 2: compute insertPos from the refreshed block ────────────────────
  let insertPos: number;
  if (block) {
    insertPos = block.bodySlices.length
      ? block.bodySlices[block.bodySlices.length - 1].end
      : slices[block.headingIdx].end;
  } else {
    // Heading insertion succeeded but block detection failed — fall back to end
    insertPos = slices[slices.length - 1]?.end ?? xml.length;
  }

  const listTemplate = sourceSlices.find((s) => s.text.trim() && isListParagraph(s.full))?.full;

  // Re-check missing certs with the refreshed slices (heading may have shifted paragraphs)
  slices = sliceParagraphs(xml);
  block = findCertSectionBlock(slices);
  const stillMissing = origCerts.filter((c) => !certTextPresent(normalizeLine(c), slices));

  for (const cert of stillMissing) {
    const certIdx = origCerts.indexOf(cert);
    let certInsertPos = insertPos;
    if (block) {
      certInsertPos = slices[block.headingIdx].end;
      let placed = false;
      for (const bodySlice of block.bodySlices) {
        const bodyNorm = normalizeLine(bodySlice.text);
        const bodyOrigIdx = origCerts.findIndex((c) => certLineMatches(bodyNorm, normalizeLine(c)));
        if (bodyOrigIdx >= 0 && certIdx < bodyOrigIdx) {
          certInsertPos = bodySlice.start;
          placed = true;
          break;
        }
        certInsertPos = bodySlice.end;
      }
      if (!placed && !block.bodySlices.length) {
        certInsertPos = slices[block.headingIdx].end;
      }
    }

    const paraXml =
      sourceParagraphForCert(sourceSlices, cert) ??
      (listTemplate
        ? setParagraphText(listTemplate, sanitizeBulletText(cert))
        : createSimpleParagraph(cert));
    xml = xml.slice(0, certInsertPos) + paraXml + xml.slice(certInsertPos);
    insertPos = certInsertPos + paraXml.length;
    slices = sliceParagraphs(xml);
    block = findCertSectionBlock(slices);
  }

  // Final verification pass — any still-missing certs appended at insertPos
  slices = sliceParagraphs(xml);
  const finalMissing = origCerts.filter((c) => !certTextPresent(normalizeLine(c), slices));
  for (const cert of finalMissing) {
    const paraXml =
      sourceParagraphForCert(sourceSlices, cert) ?? createSimpleParagraph(cert);
    xml = xml.slice(0, insertPos) + paraXml + xml.slice(insertPos);
    insertPos += paraXml.length;
  }

  return xml;
}

/** @deprecated Use ensureCertificationsFromSource */
export function restoreCertificationsInWordXml(
  xml: string,
  sourceXml: string,
  originalText: string,
): string {
  return ensureCertificationsFromSource(xml, sourceXml, originalText);
}

function headerHasContactLine(headerText: string): boolean {
  return (
    /@/.test(headerText) ||
    /\(\d{3}\)/.test(headerText) ||
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/.test(headerText) ||
    /linkedin\.com/i.test(headerText)
  );
}

function headerHasTitleLine(headerText: string, expectedTitle: string | null): boolean {
  if (expectedTitle) {
    return headerText.toLowerCase().includes(expectedTitle.toLowerCase().slice(0, Math.min(24, expectedTitle.length)));
  }
  return isMultiTitleHeadline(headerText) || isLikelyJobTitleLine(headerText);
}

function countEmptyBullets(slices: ParagraphSlice[]): number {
  return slices.filter((s) => isEmptyParagraph(s) && isListParagraph(s.full)).length;
}

function countHeaderTitleAndContactLines(
  slices: ParagraphSlice[],
  sectionStart: number,
): { titleLineCount: number; contactLineCount: number } {
  let titleLineCount = 0;
  let contactLineCount = 0;
  let seenName = false;

  for (let i = 0; i < sectionStart; i++) {
    const t = slices[i].text.trim();
    if (!t) continue;
    if (!seenName) {
      seenName = true;
      continue;
    }
    if (isHeaderContactLine(t)) contactLineCount++;
    else titleLineCount++;
  }

  return { titleLineCount, contactLineCount };
}

function contactTitleOrderValid(
  slices: ParagraphSlice[],
  sectionStart: number,
  layoutText: string,
): boolean {
  const header = parseHeaderRegion(layoutText);
  if (!header) return true;
  const roles = headerRolesInXml(slices, sectionStart);
  if (roles.titleIdx < 0 || roles.contactIdx < 0) return true;
  if (header.contactBeforeTitle) return roles.contactIdx < roles.titleIdx;
  return roles.titleIdx < roles.contactIdx;
}

function analyzeDocxHeader(
  slices: ParagraphSlice[],
  originalText: string,
  suggestedTitle?: string,
  sourceSlices: ParagraphSlice[] | null = null,
  expectedOverride?: string[],
): {
  actual: string[];
  expected: string[];
  pattern: ReturnType<typeof detectHeaderPattern>;
  nameFirst: boolean;
  headerExtraLines: number;
  oldTitleLeaked: boolean;
  titleLineCount: number;
  contactLineCount: number;
  titleDuplicated: boolean;
  headerOrderValid: boolean;
  headerBlockExact: boolean;
} {
  const expected = expectedOverride?.length
    ? expectedOverride
    : buildExpectedDocxHeaderLines(originalText, suggestedTitle);
  const pattern = detectHeaderPattern(originalText);
  const actual = getActualDocxHeaderLines(slices, originalText, expected, sourceSlices, false);
  const expectedNorms = expected.map(normalizeLine);
  const nameNorm = expectedOverride?.length
    ? normalizeLine(expectedOverride[0] ?? '')
    : pattern
      ? normalizeLine(pattern.nameLine)
      : expectedNorms[0] ?? '';

  let nameFirst = nameNorm ? normalizeLine(actual[0] ?? '') === nameNorm : true;
  const sectionEnd = findHeaderReplaceEnd(slices, originalText, expected, sourceSlices);
  if (nameNorm) {
    for (let i = 0; i < sectionEnd; i++) {
      const t = slices[i].text.trim();
      if (!t) continue;
      if (normalizeLine(t) === nameNorm) break;
      if (
        (isMultiTitleHeadline(t) || isLikelyJobTitleLine(t) || isHeaderContactLine(t)) &&
        pattern?.lineOrder[0] === 'name'
      ) {
        nameFirst = false;
        break;
      }
    }
  }

  const headerBlockExact = headerBlockMatchesExpected(actual, expected);
  const headerExtraLines = Math.max(0, actual.length - expected.length);
  const headerOrderValid = headerBlockExact;

  let titleLineCount = 0;
  let contactLineCount = 0;
  for (const line of actual) {
    if (isHeaderContactLine(line)) contactLineCount++;
    else if (isMultiTitleHeadline(line) || isLikelyJobTitleLine(line)) titleLineCount++;
  }

  const origHeadline = getResumeHeadline(originalText);
  const origNorm = origHeadline ? normalizeLine(origHeadline) : '';
  const titlePos = pattern?.lineOrder.indexOf('title') ?? -1;
  const expectedTitleNorm = titlePos >= 0 ? expectedNorms[titlePos] ?? '' : '';

  let oldTitleLeaked = false;
  if (origNorm) {
    for (const line of actual) {
      const ln = normalizeLine(line);
      if (ln === origNorm && ln !== expectedTitleNorm) {
        oldTitleLeaked = true;
        break;
      }
    }
  }

  let titleDuplicated = false;
  if (expectedTitleNorm) {
    let titleMatches = 0;
    for (const line of actual) {
      if (normalizeLine(line) === expectedTitleNorm) titleMatches++;
    }
    titleDuplicated = titleMatches > 1;
  }

  return {
    actual,
    expected,
    pattern,
    nameFirst,
    headerExtraLines,
    oldTitleLeaked,
    titleLineCount,
    contactLineCount,
    titleDuplicated,
    headerOrderValid,
    headerBlockExact,
  };
}

export function validateDocxTitle(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
  sourceXml?: string,
  expectedOverride?: string[],
): DocxTitleValidation {
  const slices = sliceParagraphs(xml);
  const sourceSlices = sourceXml ? sliceParagraphs(sourceXml) : null;
  const emptyBulletCount = countEmptyBullets(slices);
  const header = analyzeDocxHeader(slices, originalText, suggestedTitle, sourceSlices, expectedOverride);
  const {
    actual,
    expected,
    pattern,
    nameFirst,
    headerExtraLines,
    oldTitleLeaked,
    titleLineCount,
    contactLineCount,
    titleDuplicated,
    headerOrderValid: orderValid,
    headerBlockExact,
  } = header;

  const headerText = actual.join('\n');
  const location = extractHeaderLocation(originalText);
  const headerLower = headerText.toLowerCase();
  const hasContactLine = contactLineCount === 1 && headerHasContactLine(headerText);
  const certsPreserved = certificationsPresentInDoc(originalText, slices);
  const titlePos = pattern?.lineOrder.indexOf('title') ?? -1;
  const expectedTitle =
    (titlePos >= 0 ? expected[titlePos] : null) ??
    formattedHeadlineLine(originalText, suggestedTitle ?? '');
  const hasTitleLine =
    titleLineCount === 1 &&
    (!!expectedTitle ? headerHasTitleLine(headerText, expectedTitle) : titleLineCount === 1);
  const hasLocation = !location || headerLower.includes(location.toLowerCase());

  const headerStructureOk =
    headerBlockExact &&
    nameFirst &&
    headerExtraLines === 0 &&
    !oldTitleLeaked &&
    !titleDuplicated &&
    titleLineCount === 1 &&
    contactLineCount === 1 &&
    orderValid;

  const strays = suggestedTitle?.trim()
    ? findStrayTitleParagraphs(xml, originalText, suggestedTitle)
    : [];

  const lineRoles = pattern?.lineOrder ?? expected.map((_, i) => (i === 0 ? 'name' : i === 1 ? 'title' : 'contact') as HeaderLineRole);
  const headerTypographyOk = validateHeaderParagraphTypography(xml, expected, lineRoles);
  const headerBodySpacerOk = hasHeaderBodySpacer(xml, expected.length);
  const experienceRoleTitlesOk = experienceRoleTitlesPreservedInDoc(originalText, slices);

  const base = {
    strayLocations: strays.map((s) => s.sectionHint),
    hasTitleLine,
    hasLocation,
    hasContactLine,
    certsPreserved,
    emptyBulletCount,
    titleLineCount,
    contactLineCount,
    headerOrderValid: orderValid,
    nameFirst,
    headerExtraLines,
    oldTitleLeaked,
    headerBlockExact,
    titleDuplicated,
    headerTypographyOk,
    headerBodySpacerOk,
    experienceRoleTitlesOk,
  };

  const passed =
    headerStructureOk &&
    hasTitleLine &&
    hasLocation &&
    hasContactLine &&
    certsPreserved &&
    emptyBulletCount === 0 &&
    strays.length === 0 &&
    headerTypographyOk &&
    headerBodySpacerOk &&
    experienceRoleTitlesOk;

  let detail = 'header and body validated';
  if (!headerBlockExact) {
    const patternLabel = pattern?.contactBeforeTitle ? 'name → contact → title' : 'name → title → contact';
    detail =
      actual.length !== expected.length
        ? `header has ${actual.length} line(s), expected ${expected.length} (${patternLabel})`
        : `final DOCX header does not match expected ${patternLabel} pattern`;
  } else if (!nameFirst) detail = 'candidate name is not the first header line';
  else if (headerExtraLines > 0) detail = `header has ${headerExtraLines} extra line(s)`;
  else if (oldTitleLeaked) detail = 'original title line still present in header';
  else if (titleDuplicated) detail = 'tailored title appears more than once in header';
  else if (titleLineCount > 1) detail = `header has ${titleLineCount} title lines (expected 1)`;
  else if (contactLineCount > 1) detail = `header has ${contactLineCount} contact lines (expected 1)`;
  else if (strays.length) detail = `title found outside header (${strays.length} location(s))`;
  else if (!hasTitleLine) detail = 'header missing title/headline line';
  else if (!hasLocation) detail = 'header missing location';
  else if (!hasContactLine) detail = 'header missing contact line';
  else if (!certsPreserved) detail = 'certification(s) missing from document';
  else if (!headerTypographyOk) detail = 'header typography incorrect (name 13pt bold, title 12pt bold, contact 11pt regular)';
  else if (!headerBodySpacerOk) detail = 'missing blank line/spacing between header and first section';
  else if (!experienceRoleTitlesOk) detail = 'experience role title line(s) missing from document';
  else if (emptyBulletCount > 0) detail = `${emptyBulletCount} empty bullet(s)`;

  return {
    passed,
    detail,
    ...base,
  };
}

/** Apply title + contact patches and remove body strays without touching the header title slot. */
export function ensureHeaderInWordXml(
  xml: string,
  originalText: string,
  suggestedTitle: string,
): string {
  let next = xml;
  next = patchHeadlineInWordXml(next, originalText, suggestedTitle) ?? next;
  next = patchContactLocationInWordXml(next, originalText, suggestedTitle) ?? next;
  return next;
}

export function finalizeDocxHeaderAndCerts(
  xml: string,
  sourceXml: string,
  originalText: string,
  suggestedTitle?: string,
  expectedHeader?: string[],
): { xml: string; validation: DocxTitleValidation } {
  try {
    let next = replaceDocxHeaderBlock(xml, originalText, suggestedTitle, sourceXml, expectedHeader);
    if (suggestedTitle?.trim()) {
      next = removeStrayTitleFromWordXml(next, originalText, suggestedTitle);
    }
    next = ensureExperienceRoleTitlesFromSource(next, sourceXml, originalText);
    next = ensureCertificationsFromSource(next, sourceXml, originalText);
    next = removeEmptyBulletParagraphsFromWordXml(next);
    const validation = validateDocxTitle(
      next,
      originalText,
      suggestedTitle,
      sourceXml,
      expectedHeader,
    );
    return {
      xml: next,
      validation,
    };
  } catch {
    return {
      xml,
      validation: validateDocxTitle(xml, originalText, suggestedTitle, sourceXml, expectedHeader),
    };
  }
}

/** @deprecated Use replaceDocxHeaderBlock via finalizeDocxHeaderAndCerts */
export function syncHeaderInWordXml(
  xml: string,
  originalText: string,
  suggestedTitle?: string,
): string {
  return replaceDocxHeaderBlock(xml, originalText, suggestedTitle);
}

export function patchTitleInWordXmlStrong(
  xml: string,
  originalText: string,
  suggestedTitle: string,
): { xml: string; validation: DocxTitleValidation } | null {
  const trimmed = suggestedTitle.trim();
  if (!trimmed) return null;
  return finalizeDocxHeaderAndCerts(xml, xml, originalText, trimmed);
}

/** Cert lines from the original resume for DOCX restoration checks. */
export function originalCertificationLines(originalText: string): string[] {
  return extractOriginalCertificationLinesFromText(originalText);
}