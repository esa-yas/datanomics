import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import JSZip from 'jszip';
import {
  parseFaithfulLines,
  buildTailoredLines,
  sanitizeBulletText,
  isProtectedResumeLine,
  type ResumeLine,
} from '@/lib/resume/resumeLines';
import { docxBufferToInnerHtml } from '@/lib/resume/extractResumeContent';
import {
  patchSummaryInWordXmlStrong,
  validateDocxSummary,
  type DocxSummaryValidation,
} from '@/lib/resume/docxSummaryPatch';
import {
  patchSkillsInWordXml,
  validateDocxSkills,
  type DocxSkillsValidation,
} from '@/lib/resume/docxSkillsPatch';
import {
  finalizeDocxHeaderAndCerts,
  isLineInHeaderRegion,
  originalCertificationLines,
  validateDocxTitle,
  type DocxTitleValidation,
} from '@/lib/resume/docxTitlePatch';
import { buildExpectedHeaderFromSnapshot, isValidSourceSnapshot, type SourceResumeSnapshot } from '@/lib/resume/sourceResumeSnapshot';
import { detectHeaderPattern, getContactLinePatches, type HeaderLineRole } from '@/lib/resume/resumeHeaderFormat';
import { appendMissingExperienceRoleTitles, extractExperienceRoleTitleLines, isSectionHeading, isSkillCategoryLine } from '@/lib/resume/resumeStructure';
import type { ResumeSectionChange, TailorResult } from '@/lib/utils/resumeTailor';
import { filterSectionChanges, extractSummaryLines, extractSummaryText } from '@/lib/utils/resumeTailor';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BODY_SIZE = 11;
const LINE_HEIGHT = 13;
const BULLET_HANG = 12;

// ─── Debug logging helpers ────────────────────────────────────────────────────

function firstNonEmptyLines(text: string, n: number): string[] {
  return text.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, n);
}

/**
 * Emit structured debug logs for the DOCX export pipeline.
 * Enable by setting RESUME_EXPORT_DEBUG=1 in your environment or
 * calling enableResumeExportDebug() at startup.
 */
let _debugEnabled = false;
export function enableResumeExportDebug(): void { _debugEnabled = true; }
export function disableResumeExportDebug(): void { _debugEnabled = false; }

function debugLog(label: string, value: unknown): void {
  if (!_debugEnabled) return;
  // eslint-disable-next-line no-console
  console.log(`[ResumeExport] ${label}:`, JSON.stringify(value, null, 2));
}

export function logExportDebug(params: {
  originalText: string;
  tailoredText: string;
  fallbackText: string;
  suggestedTitle: string | undefined;
  sourceSnapshot: SourceResumeSnapshot;
  originalText_first10: string[];
  tailoredText_first10: string[];
  fallbackText_first10: string[];
}): void {
  debugLog('originalText_first10', params.originalText_first10);
  debugLog('tailoredText_first10', params.tailoredText_first10);
  debugLog('fallbackText_first10', params.fallbackText_first10);
  debugLog('suggestedTitle', params.suggestedTitle);
  debugLog('SourceResumeSnapshot', params.sourceSnapshot);
  debugLog('detectedHeaderPattern', params.sourceSnapshot.detectedHeaderPattern);
  debugLog('expectedHeader', buildExpectedHeaderFromSnapshot(params.sourceSnapshot, params.suggestedTitle));
  debugLog('originalCertificationLines', [...params.sourceSnapshot.originalCertificationLines]);

  // Sanity check: warn if originalText looks like it has been already tailored
  const origFirst = params.originalText_first10;
  const tailFirst = params.tailoredText_first10;
  const fallFirst = params.fallbackText_first10;
  if (JSON.stringify(origFirst) === JSON.stringify(tailFirst)) {
    console.warn('[ResumeExport] ⚠️  originalText and tailoredText have identical first 10 lines — originalText may have been replaced by tailored output. Header detection will be wrong.');
  }
  if (JSON.stringify(origFirst) === JSON.stringify(fallFirst)) {
    console.warn('[ResumeExport] ⚠️  originalText and fallbackText have identical first 10 lines — verify these are distinct.');
  }
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────

function pdfSafeText(text: string): string {
  return text
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201C|\u201D/g, '"')
    .replace(/\u2013|\u2014/g, '-')
    .replace(/[^\u0020-\u00FF]/g, '');
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  maxWidth: number,
): string[] {
  if (!text.trim()) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

type PdfPage = ReturnType<PDFDocument['addPage']>;

function drawFaithfulLine(
  line: ResumeLine,
  pdfDoc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  maxWidth: number,
  state: { page: PdfPage; y: number },
) {
  const ensureSpace = (needed: number) => {
    if (state.y < MARGIN + needed) {
      state.page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      state.y = PAGE_HEIGHT - MARGIN;
    }
  };

  if (line.isBlank) {
    state.y -= LINE_HEIGHT / 2;
    return;
  }

  const size = BODY_SIZE;

  if (line.isBullet) {
    const textX = MARGIN + BULLET_HANG;
    const textWidth = maxWidth - BULLET_HANG;
    const wrapped = wrapText(line.text, font, size, textWidth);
    for (let i = 0; i < wrapped.length; i++) {
      ensureSpace(size + 2);
      if (i === 0) {
        state.page.drawText(pdfSafeText(line.bulletChar || '\u2022'), {
          x: MARGIN,
          y: state.y - size,
          size,
          font,
          color: rgb(0, 0, 0),
        });
      }
      state.page.drawText(pdfSafeText(wrapped[i]), {
        x: textX,
        y: state.y - size,
        size,
        font,
        color: rgb(0, 0, 0),
      });
      state.y -= LINE_HEIGHT;
    }
    return;
  }

  const wrapped = wrapText(line.text, font, size, maxWidth);
  for (const wline of wrapped) {
    ensureSpace(size + 2);
    state.page.drawText(pdfSafeText(wline), {
      x: MARGIN,
      y: state.y - size,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    state.y -= LINE_HEIGHT;
  }
}

/** PDF from structured lines — bullets only when source line was a list item. */
export async function buildTailoredPdfBlobFromLines(lines: ResumeLine[]): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;

  const state = { page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };
  for (const line of lines) {
    drawFaithfulLine(line, pdfDoc, font, maxWidth, state);
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** PDF mirrors uploaded line order — bullets only when source had bullets. */
export async function buildTailoredPdfBlob(text: string): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const lines = parseFaithfulLines(text);

  const state = { page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), y: PAGE_HEIGHT - MARGIN };
  for (const line of lines) {
    drawFaithfulLine(line, pdfDoc, font, maxWidth, state);
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Word half-points: name 13pt, title 12pt, contact 11pt. */
const HEADER_RUN_STYLE: Record<HeaderLineRole, { halfPt: number; bold: boolean }> = {
  name: { halfPt: 26, bold: true },
  title: { halfPt: 24, bold: true },
  contact: { halfPt: 22, bold: false },
};

function docxFromLine(line: ResumeLine, role?: HeaderLineRole, isLastHeaderLine = false): Paragraph {
  if (line.isBlank) return new Paragraph({ spacing: { after: 120 } });

  if (line.isBullet) {
    return new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 60 },
      children: [new TextRun({ text: line.text, size: 22, font: 'Times New Roman', color: '000000' })],
    });
  }

  if (role) {
    const style = HEADER_RUN_STYLE[role];
    return new Paragraph({
      spacing: { after: isLastHeaderLine ? 240 : 80 },
      children: [
        new TextRun({
          text: line.text,
          bold: style.bold,
          size: style.halfPt,
          font: 'Times New Roman',
          color: '000000',
        }),
      ],
    });
  }

  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: line.text, size: 22, font: 'Times New Roman', color: '000000' })],
  });
}

/** Fallback DOCX when no source file — preserves header typography and spacing. */
export async function buildTailoredDocxBlob(text: string): Promise<Blob> {
  const lines = parseFaithfulLines(text);
  const headerRoles = detectHeaderPattern(text)?.lineOrder ?? [];
  let headerRoleIndex = 0;

  const children = lines.map((line) => {
    if (line.isBlank) return docxFromLine(line);

    const trimmed = line.text.trim();
    if (headerRoleIndex < headerRoles.length && !isSectionHeading(trimmed)) {
      const role = headerRoles[headerRoleIndex];
      headerRoleIndex += 1;
      const isLastHeaderLine = headerRoleIndex === headerRoles.length;
      return docxFromLine(line, role, isLastHeaderLine);
    }

    return docxFromLine(line);
  });

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBlob(doc);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordXmlPlainText(xml: string): string {
  return xml
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

function searchTextVariants(text: string): string[] {
  const trimmed = sanitizeBulletText(text);
  const norm = trimmed.replace(/\s+/g, ' ').trim();
  return [...new Set([trimmed, norm].filter(Boolean))];
}

function replaceFirstInWordXml(xml: string, search: string, replacement: string): string | null {
  const repl = escapeXml(sanitizeBulletText(replacement));

  for (const variant of searchTextVariants(search)) {
    const idx = xml.indexOf(variant);
    if (idx !== -1) {
      return xml.slice(0, idx) + repl + xml.slice(idx + variant.length);
    }
    const escaped = escapeXml(variant);
    if (escaped !== variant) {
      const idx2 = xml.indexOf(escaped);
      if (idx2 !== -1) {
        return xml.slice(0, idx2) + repl + xml.slice(idx2 + escaped.length);
      }
    }
  }

  const plain = wordXmlPlainText(xml);
  for (const variant of searchTextVariants(search)) {
    const norm = variant.replace(/\s+/g, ' ').trim();
    if (!plain.includes(norm)) continue;

    const words = variant.trim().split(/\s+/).filter(Boolean);
    if (words.length < 2) continue;

    const wordPatterns = words.map((w) =>
      w.split('').map((c) => escapeRegex(c)).join('(?:<[^>]+>)*'),
    );
    const pattern = wordPatterns.join('(?:<[^>]+>|\\s)+');
    const re = new RegExp(pattern);

    const match = xml.match(re);
    if (match && match.index != null) {
      return xml.slice(0, match.index) + repl + xml.slice(match.index + match[0].length);
    }
  }

  return null;
}

/** Replace the Professional Summary body inside Word XML (legacy text-anchor fallback). */
function patchSummaryInWordXml(
  xml: string,
  originalText: string,
  newSummary: string,
): string | null {
  const tailored = sanitizeBulletText(newSummary);
  if (!tailored) return null;

  const summaryLines = extractSummaryLines(originalText);
  if (!summaryLines.length) return null;

  const joined = summaryLines.join(' ');
  if (normalizeLine(joined) === normalizeLine(tailored)) return null;

  const attempts: string[] = [joined, ...summaryLines];
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length >= 8) {
    attempts.push(words.slice(0, 12).join(' '));
  }
  if (words.length >= 4) {
    attempts.push(words.slice(0, 6).join(' '));
  }

  const seen = new Set<string>();
  for (const search of attempts) {
    const key = search.slice(0, 80);
    if (!search || seen.has(key)) continue;
    seen.add(key);
    const patched = replaceFirstInWordXml(xml, search, tailored);
    if (patched) return patched;
  }
  return null;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function patchDocxBuffer(
  source: ArrayBuffer,
  sectionChanges: ResumeSectionChange[],
  /**
   * MUST be the immutable extracted text from the original uploaded file.
   * Never pass tailoredText or fallbackText here — the header detector
   * uses this to find the candidate name, title slot, and contact row.
   */
  originalText?: string,
  optimizedSummary?: string,
  suggestedTitle?: string,
  tailoredText?: string,
  jdText?: string,
  sourceSnapshot?: SourceResumeSnapshot,
): Promise<{
  blob: Blob;
  applied: number;
  summaryValidation?: DocxSummaryValidation;
  skillsValidation?: DocxSkillsValidation;
  titleValidation?: DocxTitleValidation;
}> {
  const zip = await JSZip.loadAsync(source);
  const docFile = zip.file('word/document.xml');
  if (!docFile) return { blob: new Blob(), applied: 0 };

  let xml = await docFile.async('string');
  // sourceXml is the untouched original DOCX XML — used by finalizeDocxHeaderAndCerts
  // to source cert paragraph formatting from the real file, NOT from any patched copy.
  const sourceXml = xml;
  let applied = 0;
  let summaryValidation: DocxSummaryValidation | undefined;
  let skillsValidation: DocxSkillsValidation | undefined;
  let titleValidation: DocxTitleValidation | undefined;

  const patches = [...filterSectionChanges(sectionChanges)].filter(
    (change) => !isSkillCategoryLine(change.original?.trim() ?? ''),
  );

  if (optimizedSummary?.trim()) {
    const structural = patchSummaryInWordXmlStrong(xml, optimizedSummary, originalText);
    if (structural) {
      xml = structural.xml;
      summaryValidation = structural.validation;
      if (structural.validation.passed) applied++;
    }

    if (!summaryValidation?.passed) {
      const legacy = originalText
        ? patchSummaryInWordXml(xml, originalText, optimizedSummary)
        : null;
      if (legacy) {
        xml = legacy;
        summaryValidation = validateDocxSummary(xml, optimizedSummary, originalText);
        if (summaryValidation.passed) applied++;
      } else if (!summaryValidation) {
        summaryValidation = validateDocxSummary(xml, optimizedSummary, originalText);
      }
    }
  }

  if (originalText) {
    for (const contactPatch of getContactLinePatches(originalText, suggestedTitle)) {
      patches.push({ label: 'Contact', ...contactPatch });
    }
  }

  for (const change of patches) {
    const from = change.original.trim();
    const to = change.tailored.trim();
    if (!from || !to || from === to) continue;
    if (isProtectedResumeLine(from)) continue;
    if (/^title$/i.test(change.label ?? '')) continue;
    // Guard: never apply a patch for a line that lives in the header region.
    // Use ONLY originalText for this check — never tailoredText, which may have
    // already been modified and could produce wrong results.
    if (originalText && isLineInHeaderRegion(originalText, from)) continue;

    const patched = replaceFirstInWordXml(xml, from, to);
    if (patched) {
      xml = patched;
      applied++;
    }
  }

  if (originalText && tailoredText) {
    const skillsPatch = patchSkillsInWordXml(xml, originalText, tailoredText);
    if (skillsPatch) {
      xml = skillsPatch.xml;
      skillsValidation = skillsPatch.validation;
      if (skillsPatch.validation.passed) applied++;
    } else {
      skillsValidation = validateDocxSkills(xml, originalText, tailoredText, jdText ?? '');
    }
  }

  if (originalText) {
    // finalizeDocxHeaderAndCerts MUST receive:
    //   xml        — current patched XML (will be modified)
    //   sourceXml  — the raw original DOCX XML (for cert template paragraphs)
    //   originalText — immutable plain text from the upload (for header pattern detection)
    //   suggestedTitle — the new title to write
    const expectedHeader = sourceSnapshot
      ? buildExpectedHeaderFromSnapshot(sourceSnapshot, suggestedTitle)
      : undefined;
    const finalized = finalizeDocxHeaderAndCerts(
      xml,
      sourceXml,
      originalText,
      suggestedTitle,
      expectedHeader,
    );
    xml = finalized.xml;
    titleValidation = finalized.validation;
    applied++;
  }

  if (applied === 0) {
    return { blob: new Blob(), applied: 0, summaryValidation, skillsValidation, titleValidation };
  }

  zip.file('word/document.xml', xml);
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  return { blob, applied, summaryValidation, skillsValidation, titleValidation };
}

/** Read word/document.xml back from a generated DOCX blob. */
async function readDocxDocumentXml(blob: Blob): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const file = zip.file('word/document.xml');
    return file ? await file.async('string') : null;
  } catch {
    return null;
  }
}

function paragraphTextFromXml(pXml: string): string {
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

/** All non-empty paragraph texts from a document.xml string. */
function allNonEmptyParagraphs(xml: string): string[] {
  const out: string[] = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = paragraphTextFromXml(m[0]);
    if (text) out.push(text);
  }
  return out;
}

function norm(s: string): string {
  return normLine(s);
}

function normLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function certPresentInPlainText(bodyText: string, cert: string): boolean {
  const certNorm = normLine(cert);
  const minOverlap = Math.min(24, Math.floor(certNorm.length * 0.55));
  for (const raw of bodyText.split('\n')) {
    const ln = normLine(raw);
    if (!ln) continue;
    if (ln === certNorm) return true;
    if (ln.includes(certNorm) || certNorm.includes(ln)) {
      const shorter = ln.length <= certNorm.length ? ln : certNorm;
      if (shorter.length >= minOverlap) return true;
    }
  }
  return false;
}

/** Re-insert immutable certification lines removed by AI tailoring in fallback body text. */
function appendMissingCertificationsToText(
  bodyText: string,
  originalCerts: readonly string[],
): string {
  if (!originalCerts.length) return bodyText;
  const missing = originalCerts.filter((c) => !certPresentInPlainText(bodyText, c));
  if (!missing.length) return bodyText;

  const lines = bodyText.split('\n');
  let certIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^CERTIFICATIONS?$/i.test(t) || (isSectionHeading(t) && /CERTIFICATION/i.test(t))) {
      certIdx = i;
      break;
    }
  }

  if (certIdx < 0) {
    return `${bodyText.trimEnd()}\n\nCERTIFICATIONS\n${missing.join('\n')}`;
  }

  let insertAt = certIdx + 1;
  for (let i = certIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) {
      insertAt = i + 1;
      continue;
    }
    if (isSectionHeading(t)) break;
    insertAt = i + 1;
  }

  const out = [...lines];
  out.splice(insertAt, 0, ...missing);
  return out.join('\n');
}

async function postProcessDocxBlob(
  blob: Blob,
  sourceBuffer: ArrayBuffer,
  snapshot: SourceResumeSnapshot,
  suggestedTitle?: string,
): Promise<Blob> {
  const sourceZip = await JSZip.loadAsync(sourceBuffer);
  const sourceXml = await sourceZip.file('word/document.xml')?.async('string');
  const targetZip = await JSZip.loadAsync(await blob.arrayBuffer());
  const targetXml = await targetZip.file('word/document.xml')?.async('string');
  if (!sourceXml || !targetXml) return blob;

  const expectedHeader = buildExpectedHeaderFromSnapshot(snapshot, suggestedTitle);
  const { xml } = finalizeDocxHeaderAndCerts(
    targetXml,
    sourceXml,
    snapshot.originalText,
    suggestedTitle,
    expectedHeader,
  );
  targetZip.file('word/document.xml', xml);
  return targetZip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}


export interface ExportedDocxCheck {
  headerOk: boolean;
  certsOk: boolean;
  firstParagraphIsName: boolean;
  titleInBody: boolean;
  emptyBullets: number;
  detail: string;
  expectedHeader: string[];
  actualHeader: string[];
}

/**
 * Re-parse the ACTUAL exported DOCX and compare its first non-empty paragraphs
 * against the expected header block, plus verify every original certification survives.
 *
 * IMPORTANT: originalText here must be the immutable upload text, not tailored copy.
 */
async function inspectExportedDocx(
  blob: Blob,
  sourceSnapshot: SourceResumeSnapshot,
  suggestedTitle: string | undefined,
): Promise<ExportedDocxCheck> {
  const expectedHeader = buildExpectedHeaderFromSnapshot(sourceSnapshot, suggestedTitle);
  const originalText = sourceSnapshot.originalText;
  const xml = await readDocxDocumentXml(blob);

  if (!xml || !expectedHeader.length) {
    return {
      headerOk: false,
      certsOk: false,
      firstParagraphIsName: false,
      titleInBody: false,
      emptyBullets: 0,
      detail: 'could not read exported document.xml',
      expectedHeader,
      actualHeader: [],
    };
  }

  const paragraphs = allNonEmptyParagraphs(xml);
  const preSectionHeader: string[] = [];
  for (const p of paragraphs) {
    if (isSectionHeading(p)) break;
    preSectionHeader.push(p);
  }
  const actualHeader = preSectionHeader;
  const expectedHeaderTop = expectedHeader;

  debugLog('actualExportedHeader', actualHeader);
  debugLog('expectedHeader (for validation)', expectedHeaderTop);

  const firstParagraphIsName = norm(actualHeader[0] ?? '') === norm(sourceSnapshot.candidateName ?? '');

  const headerOk =
    actualHeader.length === expectedHeaderTop.length &&
    actualHeader.every((line, i) => norm(line) === norm(expectedHeaderTop[i] ?? ''));

  const certs = [...sourceSnapshot.originalCertificationLines];
  const validated = validateDocxTitle(xml, originalText, suggestedTitle, undefined, expectedHeader);
  const certsOk = validated.certsPreserved;

  debugLog('finalCertificationLines (in exported DOCX)', paragraphs.filter((p) => {
    const n = norm(p);
    return certs.some((c) => norm(c) === n || n.includes(norm(c)) || norm(c).includes(n));
  }));

  const headerLineCount = expectedHeader.length;
  const body = paragraphs.slice(
    paragraphs.findIndex((p) => isSectionHeading(p)) >= 0
      ? paragraphs.findIndex((p) => isSectionHeading(p))
      : headerLineCount,
  );
  const suggestedNorm = suggestedTitle ? norm(suggestedTitle) : '';
  const formattedNorm = suggestedTitle
    ? norm(buildExpectedHeaderFromSnapshot(sourceSnapshot, suggestedTitle).find((line) => line.includes('|') && line !== sourceSnapshot.originalContactLine) ?? '')
    : '';
  const allowedExperienceNorms = new Set(
    extractExperienceRoleTitleLines(originalText).map((t) => norm(t)),
  );
  const titleInBody = !!(suggestedNorm || formattedNorm) && body.some((line) => {
    const ln = norm(line);
    if (!ln) return false;
    if (allowedExperienceNorms.has(ln)) return false;
    if (suggestedNorm && (ln.includes(suggestedNorm) || suggestedNorm.includes(ln))) return true;
    if (formattedNorm && (ln.includes(formattedNorm) || formattedNorm.includes(ln))) return true;
    return false;
  });

  let detail = 'exported header and certifications verified';
  if (!firstParagraphIsName) detail = 'first paragraph is not the candidate name';
  else if (!headerOk) detail = `exported header does not match expected block (${actualHeader.length}/${expectedHeaderTop.length} lines)`;
  else if (titleInBody) detail = 'suggested title leaked into body sections';
  else if (!certsOk) detail = 'certification(s) missing from exported DOCX';
  else if (!validated.passed) detail = validated.detail;

  debugLog('inspectExportedDocx validation', {
    firstParagraphIsName,
    headerOk,
    certsOk,
    titleInBody,
    validatedPassed: validated.passed,
    detail,
    actualHeader,
    expectedHeader: expectedHeaderTop,
  });

  const passed =
    firstParagraphIsName &&
    headerOk &&
    validated.passed &&
    certsOk &&
    !titleInBody &&
    validated.emptyBulletCount === 0;

  return {
    headerOk: headerOk && validated.headerBlockExact && validated.passed,
    certsOk,
    firstParagraphIsName,
    titleInBody,
    emptyBullets: validated.emptyBulletCount,
    detail: passed ? 'exported header and certifications verified' : detail,
    expectedHeader: expectedHeaderTop,
    actualHeader,
  };
}

/**
 * Patch uploaded DOCX — keeps Word formatting, but fails closed to a clean rebuild.
 *
 * Parameter contract:
 *   sourceDocxUrl — URL of the original uploaded DOCX (may be undefined for text-only flow)
 *   sectionChanges — AI-generated section edits
 *   fallbackText  — the tailored plain text (used to build body when patching fails)
 *   originalText  — IMMUTABLE plain text extracted from the original uploaded resume.
 *                   This is the single source of truth for:
 *                     • header pattern detection (name / title / contact positions)
 *                     • certification line enumeration
 *                     • contact-line guard (isLineInHeaderRegion)
 *                   NEVER pass tailoredText here. If you cannot guarantee immutability,
 *                   extract from the source DOCX again before calling this function.
 */
export async function buildTailoredDocxFromSource(
  sourceDocxUrl: string | undefined,
  sectionChanges: ResumeSectionChange[],
  fallbackText: string,
  originalText?: string,
  optimizedSummary?: string,
  suggestedTitle?: string,
  jdText?: string,
  sourceSnapshot?: SourceResumeSnapshot,
): Promise<{
  blob: Blob;
  summaryValidation?: DocxSummaryValidation;
  skillsValidation?: DocxSkillsValidation;
  titleValidation?: DocxTitleValidation;
}> {
  if (!sourceSnapshot || !isValidSourceSnapshot(sourceSnapshot)) {
    throw new Error(
      'Source resume snapshot is not ready or invalid — could not detect candidate name and header pattern from the original upload. Re-upload the resume DOCX.',
    );
  }

  const snapshot = sourceSnapshot;
  const immutableOriginalText = snapshot.originalText;

  if (immutableOriginalText && _debugEnabled) {
    logExportDebug({
      originalText: immutableOriginalText,
      tailoredText: fallbackText,
      fallbackText,
      suggestedTitle,
      sourceSnapshot: snapshot,
      originalText_first10: firstNonEmptyLines(immutableOriginalText, 10),
      tailoredText_first10: firstNonEmptyLines(fallbackText, 10),
      fallbackText_first10: firstNonEmptyLines(fallbackText, 10),
    });
    debugLog('expectedHeader', buildExpectedHeaderFromSnapshot(snapshot, suggestedTitle));
  }

  const checkBlob = async (blob: Blob): Promise<ExportedDocxCheck> =>
    inspectExportedDocx(blob, snapshot, suggestedTitle);

  /**
   * buildCleanFallback: builds a clean DOCX from expected header + tailored body.
   *
   * BUG FIX: previously this function called detectHeaderPattern(fallbackText) to
   * count how many header lines to drop from the fallback. But fallbackText is the
   * TAILORED text, which may already have a modified or duplicated header. That caused
   * wrong header line counts and left stale title lines in the output.
   *
   * Fix: always use originalText (if available) to determine the header block size,
   * and always strip from fallbackText using the original header line count.
   */
  const buildCleanFallback = async (sourceBuffer?: ArrayBuffer): Promise<Blob> => {
    const expected = buildExpectedHeaderFromSnapshot(snapshot, suggestedTitle);
    if (!expected.length) throw new Error('Could not build expected header from source resume snapshot.');

    const lines = fallbackText.split('\n');
    let bodyStart = lines.findIndex((l) => l.trim() && isSectionHeading(l.trim()));

    if (bodyStart < 0) {
      const headerCount = Math.min(
        snapshot.detectedHeaderPattern?.originalLineCount ?? expected.length,
        expected.length,
        6,
      );
      let dropped = 0;
      bodyStart = 0;
      for (let i = 0; i < lines.length && dropped < headerCount; i++) {
        if (lines[i].trim()) dropped++;
        bodyStart = i + 1;
      }
    }

    let bodyText = lines.slice(bodyStart).join('\n');
    bodyText = appendMissingExperienceRoleTitles(bodyText, snapshot.originalText);
    if (snapshot.originalCertificationLines.length) {
      bodyText = appendMissingCertificationsToText(bodyText, snapshot.originalCertificationLines);
    }
    const cleanText = [...expected, '', ...bodyText.split('\n')].join('\n');
    debugLog('buildCleanFallback', {
      bodyStart,
      headerCount: snapshot.detectedHeaderPattern?.originalLineCount ?? expected.length,
      expected,
      bodyFirst4: bodyText.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4),
    });

    let blob = await buildTailoredDocxBlob(cleanText);
    if (sourceBuffer) {
      blob = await postProcessDocxBlob(blob, sourceBuffer, snapshot, suggestedTitle);
    } else if (sourceDocxUrl) {
      try {
        const res = await fetch(sourceDocxUrl);
        if (res.ok) {
          blob = await postProcessDocxBlob(blob, await res.arrayBuffer(), snapshot, suggestedTitle);
        }
      } catch {
        /* keep text-only fallback */
      }
    }
    return blob;
  };

  if (!sourceDocxUrl) {
    const fallbackBlob = await buildCleanFallback();
    const check = await checkBlob(fallbackBlob);
    if (!check.firstParagraphIsName || !check.headerOk || !check.certsOk || check.titleInBody || check.emptyBullets > 0) {
      throw new Error(check.detail);
    }
    return { blob: fallbackBlob };
  }

  let sourceBuffer: ArrayBuffer | undefined;
  try {
    const res = await fetch(sourceDocxUrl);
    if (!res.ok) throw new Error('fetch failed');
    sourceBuffer = await res.arrayBuffer();
  } catch (fetchErr) {
    const fallbackBlob = await buildCleanFallback();
    const check = await checkBlob(fallbackBlob);
    if (!check.firstParagraphIsName || !check.headerOk || !check.certsOk || check.titleInBody || check.emptyBullets > 0) {
      throw fetchErr instanceof Error ? fetchErr : new Error('Could not fetch source DOCX');
    }
    return { blob: fallbackBlob };
  }

  try {
    const { blob, applied, summaryValidation, skillsValidation, titleValidation } = await patchDocxBuffer(
      sourceBuffer,
      sectionChanges,
      immutableOriginalText,
      optimizedSummary,
      suggestedTitle,
      fallbackText,
      jdText,
      snapshot,
    );

    if (applied <= 0) {
      const fallbackBlob = await buildCleanFallback(sourceBuffer);
      const check = await checkBlob(fallbackBlob);
      if (!check.firstParagraphIsName || !check.headerOk || !check.certsOk || check.titleInBody || check.emptyBullets > 0) {
        throw new Error(check.detail);
      }
      return {
        blob: fallbackBlob,
        summaryValidation,
        skillsValidation,
        titleValidation,
      };
    }

    const check = await inspectExportedDocx(blob, snapshot, suggestedTitle);

    if (check.firstParagraphIsName && check.headerOk && check.certsOk && !check.titleInBody && check.emptyBullets === 0) {
      return { blob, summaryValidation, skillsValidation, titleValidation };
    }

    debugLog('inspectExportedDocx FAILED — falling back to clean rebuild', {
      detail: check.detail,
      actualHeader: check.actualHeader,
      expectedHeader: check.expectedHeader,
    });

    const fallbackBlob = await buildCleanFallback(sourceBuffer);
    const fallbackCheck = await inspectExportedDocx(fallbackBlob, snapshot, suggestedTitle);

    if (
      !fallbackCheck.firstParagraphIsName ||
      !fallbackCheck.headerOk ||
      !fallbackCheck.certsOk ||
      fallbackCheck.titleInBody ||
      fallbackCheck.emptyBullets > 0
    ) {
      throw new Error(fallbackCheck.detail);
    }

    return {
      blob: fallbackBlob,
      summaryValidation,
      skillsValidation,
      titleValidation,
    };
  } catch (err) {
    if (err instanceof Error && !/fetch failed/i.test(err.message)) {
      throw err;
    }
    const fallbackBlob = await buildCleanFallback(sourceBuffer);
    const check = await checkBlob(fallbackBlob);
    if (!check.firstParagraphIsName || !check.headerOk || !check.certsOk || check.titleInBody || check.emptyBullets > 0) {
      throw err instanceof Error ? err : new Error('DOCX export failed');
    }
    return { blob: fallbackBlob };
  }
}

export interface TailoredDocumentBundle {
  pdfBlob: Blob | null;
  docxBlob: Blob;
  pdfUrl: string | null;
  docxInnerHtml: string | null;
  docxSummaryValidation?: DocxSummaryValidation;
  docxSkillsValidation?: DocxSkillsValidation;
  docxTitleValidation?: DocxTitleValidation;
}

/** Build PDF only — used after DOCX preview is ready. */
export async function buildTailoredPdfOnly(
  tailoredText: string,
  originalLines?: ResumeLine[],
  tailorResult?: Pick<TailorResult, 'optimizedSummary' | 'suggestedTitle' | 'sectionChanges'>,
): Promise<Blob> {
  if (originalLines?.length && tailorResult) {
    const tailoredLines = buildTailoredLines(originalLines, tailorResult);
    return buildTailoredPdfBlobFromLines(tailoredLines);
  }
  return buildTailoredPdfBlob(tailoredText);
}

/**
 * Build both DOCX and PDF for a tailored resume.
 *
 * @param tailoredText  The AI-tailored plain text (used as body + PDF source)
 * @param sectionChanges  Section-level diffs from the AI
 * @param sourceDocxUrl  URL of the original uploaded DOCX (optional)
 * @param originalLines  Structured lines from the original upload (for faithful PDF)
 * @param tailorResult  Tailor result with summary/title/changes
 * @param originalText  IMMUTABLE plain text from the original upload — MUST be the
 *                      raw extracted text, never a tailored or modified copy.
 *                      This is the only parameter used for header/cert detection.
 * @param jdText  Job description text (for skills patching)
 */
export async function buildTailoredDocuments(
  tailoredText: string,
  sectionChanges: ResumeSectionChange[],
  sourceDocxUrl?: string,
  originalLines?: ResumeLine[],
  tailorResult?: Pick<TailorResult, 'optimizedSummary' | 'suggestedTitle' | 'sectionChanges'>,
  originalText?: string,
  jdText?: string,
  sourceSnapshot?: SourceResumeSnapshot,
): Promise<TailoredDocumentBundle> {
  const {
    blob: docxBlob,
    summaryValidation: docxSummaryValidation,
    skillsValidation: docxSkillsValidation,
    titleValidation: docxTitleValidation,
  } = await buildTailoredDocxFromSource(
    sourceDocxUrl,
    sectionChanges,
    tailoredText,       // fallbackText = the tailored body text
    originalText,       // originalText = immutable upload text — NEVER swap these two
    tailorResult?.optimizedSummary,
    tailorResult?.suggestedTitle,
    jdText,
    sourceSnapshot,
  );

  let docxInnerHtml: string | null = null;
  try {
    docxInnerHtml = await docxBufferToInnerHtml(await docxBlob.arrayBuffer());
  } catch {
    docxInnerHtml = null;
  }

  const pdfBlob = await buildTailoredPdfOnly(tailoredText, originalLines, tailorResult);

  return {
    pdfBlob,
    docxBlob,
    pdfUrl: URL.createObjectURL(pdfBlob),
    docxInnerHtml,
    docxSummaryValidation,
    docxSkillsValidation,
    docxTitleValidation,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'resume';
}