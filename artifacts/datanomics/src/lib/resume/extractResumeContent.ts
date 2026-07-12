import { linesToPlainText, type ResumeLine } from '@/lib/resume/resumeLines';
import { splitMammothHtml, wrapMammothInnerHtml, type SplitResumeHtml } from '@/lib/resume/resumeHeader';

export type { SplitResumeHtml };
export { splitMammothHtml, wrapMammothInnerHtml };

export interface ExtractedResume {
  plainText: string;
  lines: ResumeLine[];
  html: string | null;
  innerHtml: string | null;
  split: SplitResumeHtml | null;
}

const ACCEPTED = new Set(['pdf', 'docx']);

export function isResumeFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase();
  return !!ext && ACCEPTED.has(ext);
}

export function resumeFileAccept(): string {
  return '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

/** Walk mammoth HTML and build ordered lines with real list bullets. */
export function htmlToResumeLines(html: string, fallbackPlain: string): ResumeLine[] {
  if (typeof DOMParser === 'undefined') {
    return fallbackPlain.split('\n').map((raw) => {
      const trimmed = raw.trim();
      if (!trimmed) return { text: '', isBullet: false, bulletChar: '', isBlank: true, rawLine: raw };
      const m = trimmed.match(/^([•\-\–*●▪◦‣▸►])\s*(.*)$/);
      if (m) return { isBullet: true, bulletChar: m[1], text: m[2].trim(), isBlank: false, rawLine: raw };
      return { text: trimmed, isBullet: false, bulletChar: '', isBlank: false, rawLine: raw };
    });
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const lines: ResumeLine[] = [];

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName?.toLowerCase();

    if (tag === 'li') {
      const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text) {
        lines.push({
          isBullet: true,
          bulletChar: '•',
          text,
          isBlank: false,
          rawLine: text,
        });
      }
      return;
    }

    if (tag === 'p') {
      const text = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text) {
        const m = text.match(/^([•\-\–*●▪◦‣▸►])\s*(.*)$/);
        if (m) {
          lines.push({
            isBullet: true,
            bulletChar: m[1],
            text: m[2].trim(),
            isBlank: false,
            rawLine: `${m[1]} ${m[2].trim()}`,
          });
        } else {
          lines.push({
            text,
            isBullet: false,
            bulletChar: '',
            isBlank: false,
            rawLine: text,
          });
        }
      } else {
        lines.push({ text: '', isBullet: false, bulletChar: '', isBlank: true, rawLine: '' });
      }
      return;
    }

    if (tag === 'br') {
      lines.push({ text: '', isBullet: false, bulletChar: '', isBlank: true, rawLine: '' });
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      for (const child of Array.from(el.childNodes)) walk(child);
      return;
    }

    if (tag === 'table') {
      for (const row of Array.from(el.querySelectorAll('tr'))) {
        const cells = Array.from(row.querySelectorAll('td, th'))
          .map((c) => c.textContent?.trim())
          .filter(Boolean);
        if (cells.length) {
          const text = cells.join(' | ');
          lines.push({
            text,
            isBullet: false,
            bulletChar: '',
            isBlank: false,
            rawLine: text,
          });
        }
      }
      return;
    }

    for (const child of Array.from(el.childNodes)) walk(child);
  };

  for (const child of Array.from(doc.body.childNodes)) walk(child);

  if (!lines.length) {
    return htmlToResumeLines('', fallbackPlain);
  }

  return lines;
}

async function extractFromDocxBuffer(buffer: ArrayBuffer): Promise<ExtractedResume> {
  const mammoth = await import('mammoth');
  const [textResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ arrayBuffer: buffer }),
    mammoth.convertToHtml({ arrayBuffer: buffer }),
  ]);

  const lines = htmlToResumeLines(htmlResult.value, textResult.value);
  const plainText = linesToPlainText(lines).trim() || textResult.value.trim();
  const split = splitMammothHtml(htmlResult.value);

  return {
    plainText,
    lines,
    html: wrapMammothInnerHtml(htmlResult.value),
    innerHtml: htmlResult.value,
    split,
  };
}

async function extractFromPdfBuffer(data: Uint8Array): Promise<ExtractedResume> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const doc = await pdfjs.getDocument({ data }).promise;
  const lines: ResumeLine[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();

    type PdfTextItem = { str: string; transform: number[] };
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
        items.push({ str: item.str, transform: item.transform });
      }
    }

    const rows = new Map<number, PdfTextItem[]>();
    for (const item of items) {
      const y = Math.round((item.transform[5] ?? 0) / 2) * 2;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push(item);
    }

    const sortedYs = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedYs) {
      const rowItems = rows.get(y)!.sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
      const text = rowItems.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;

      const m = text.match(/^([•\-\–*●▪◦‣▸►])\s*(.*)$/);
      if (m) {
        lines.push({
          isBullet: true,
          bulletChar: m[1],
          text: m[2].trim(),
          isBlank: false,
          rawLine: `${m[1]} ${m[2].trim()}`,
        });
      } else {
        lines.push({
          text,
          isBullet: false,
          bulletChar: '',
          isBlank: false,
          rawLine: text,
        });
      }
    }

    if (pageNum < doc.numPages) {
      lines.push({ text: '', isBullet: false, bulletChar: '', isBlank: true, rawLine: '' });
    }
  }

  const plainText = linesToPlainText(lines).trim();
  if (!plainText) throw new Error('No text found in this PDF (it may be scanned/image-only).');

  return { plainText, lines, html: null, innerHtml: null, split: null };
}

export async function extractResumeContent(file: File): Promise<ExtractedResume> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (ext === 'docx') {
    const result = await extractFromDocxBuffer(buffer);
    if (!result.plainText) throw new Error('No text found in this DOCX file.');
    return result;
  }

  if (ext === 'pdf') {
    return extractFromPdfBuffer(new Uint8Array(buffer));
  }

  throw new Error('Only PDF and DOCX files are supported.');
}

export async function extractResumeFromDocxUrl(url: string): Promise<ExtractedResume> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not load DOCX file.');
  return extractFromDocxBuffer(await res.arrayBuffer());
}

/** Non-empty paragraph texts from word/document.xml — authoritative DOCX order. */
export async function extractDocxParagraphTexts(buffer: ArrayBuffer): Promise<string[]> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return [];

  const out: string[] = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = m[0]
      .replace(/<w:tab[^/>]*\/>/g, '\t')
      .replace(/<w:br[^/>]*\/>/g, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(text);
  }
  return out;
}

export async function docxBufferToInnerHtml(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return value;
}

export async function docxBufferToHtml(buffer: ArrayBuffer): Promise<string> {
  const inner = await docxBufferToInnerHtml(buffer);
  return wrapMammothInnerHtml(inner);
}

/** Re-export for backward compat — uses improved extraction. */
export async function extractTextFromResumeFile(file: File): Promise<string> {
  const { plainText } = await extractResumeContent(file);
  return plainText;
}
