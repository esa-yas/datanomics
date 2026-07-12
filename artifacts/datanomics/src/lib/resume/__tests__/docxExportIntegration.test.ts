import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { Document, Packer, Paragraph, TextRun } from 'docx';

import { buildTailoredDocxFromSource } from '../exportTailored';
import { validateDocxTitle } from '../docxTitlePatch';
import { createSourceResumeSnapshot } from '../sourceResumeSnapshot';

async function buildSourceDocxBuffer(lines: string[]): Promise<ArrayBuffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: lines.map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line })],
            }),
        ),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

async function readDocxParagraphs(buffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) return [];
  const out: string[] = [];
  const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const text = m[0]
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) out.push(text);
  }
  return out;
}

describe('DOCX export integration — Pattern B fallback', () => {
  const original = [
    'JANE DOE',
    'Washington, DC | jane@email.com | 555-555-5555',
    'Senior Financial Analyst | Business Analyst | Data & Analytics Consulting',
    'PROFESSIONAL SUMMARY',
    'Summary line',
    'TECHNICAL SKILLS',
    'Analytics: Power BI, SQL',
    'CERTIFICATIONS',
    'Salesforce Administrator Certification',
  ].join('\n');

  const suggestedTitle = 'Senior BI Reporting Analyst | Financial Data Analyst';

  it('rebuilds Pattern B header and restores Salesforce cert when AI drops it', async () => {
    const snapshot = createSourceResumeSnapshot(original, { candidateNameHint: 'JANE DOE' });
    const sourceBuffer = await buildSourceDocxBuffer(original.split('\n'));

    const tailoredText = [
      'Senior BI Reporting Analyst | Financial Data Analyst',
      'Washington, DC | jane@email.com | 555-555-5555',
      'JANE DOE',
      'Senior Financial Analyst | Business Analyst | Data & Analytics Consulting',
      'PROFESSIONAL SUMMARY',
      'Tailored summary for BI reporting role.',
      'TECHNICAL SKILLS',
      'Analytics: Power BI, SQL, Salesforce',
      'CERTIFICATIONS',
    ].join('\n');

    const sourceBlob = new Blob([sourceBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const sourceUrl = URL.createObjectURL(sourceBlob);

    try {
      const { blob, titleValidation } = await buildTailoredDocxFromSource(
        sourceUrl,
        [],
        tailoredText,
        original,
        'Tailored summary for BI reporting role.',
        suggestedTitle,
        undefined,
        snapshot,
      );

      const xml = await (await JSZip.loadAsync(await blob.arrayBuffer()))
        .file('word/document.xml')
        ?.async('string');
      expect(xml).toBeTruthy();

      const validation = validateDocxTitle(xml!, original, suggestedTitle);
      const paragraphs = await readDocxParagraphs(await blob.arrayBuffer());

      expect(validation.passed).toBe(true);
      expect(validation.certsPreserved).toBe(true);
      expect(validation.headerBlockExact).toBe(true);
      expect(validation.nameFirst).toBe(true);
      expect(paragraphs[0]).toBe('JANE DOE');
      expect(paragraphs[1]).toContain('jane@email.com');
      expect(paragraphs[2]).toContain('Senior BI Reporting Analyst');
      expect(paragraphs.some((p) => p.includes('Salesforce Administrator Certification'))).toBe(true);
      expect(titleValidation?.passed).toBe(true);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  });
});

describe('DOCX export — experience role title preservation', () => {
  it('keeps experience job title lines when they overlap suggested-title keywords (Judy-style)', async () => {
    const roleTitle = 'Senior Financial Data Analyst';
    const original = [
      'JUDY GEBRU',
      'Washington, DC | judy@email.com | 555-555-5555',
      'Senior Financial Analyst | Business Analyst | Data & Analytics Consulting',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'PROFESSIONAL EXPERIENCE',
      roleTitle,
      'Deloitte – Government & Public Services | Washington, DC | May 2022 – Present',
      'Delivered reporting packages for federal clients.',
      'CERTIFICATIONS',
      'Certification A',
    ].join('\n');

    const suggestedTitle = `Senior BI Reporting Analyst | ${roleTitle}`;
    const snapshot = createSourceResumeSnapshot(original, { candidateNameHint: 'JUDY GEBRU' });
    const sourceBuffer = await buildSourceDocxBuffer(original.split('\n'));
    const sourceUrl = URL.createObjectURL(
      new Blob([sourceBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );

    const tailoredText = [
      'Senior BI Reporting Analyst | Senior Financial Data Analyst',
      'Washington, DC | judy@email.com | 555-555-5555',
      'JUDY GEBRU',
      'PROFESSIONAL SUMMARY',
      'Tailored summary.',
      'PROFESSIONAL EXPERIENCE',
      'Deloitte – Government & Public Services | Washington, DC | May 2022 – Present',
      'Delivered reporting packages for federal clients.',
      'CERTIFICATIONS',
      'Certification A',
    ].join('\n');

    try {
      const { blob, titleValidation } = await buildTailoredDocxFromSource(
        sourceUrl,
        [],
        tailoredText,
        original,
        'Tailored summary.',
        suggestedTitle,
        undefined,
        snapshot,
      );

      const paragraphs = await readDocxParagraphs(await blob.arrayBuffer());
      const expIdx = paragraphs.findIndex((p) => p === 'PROFESSIONAL EXPERIENCE');
      expect(expIdx).toBeGreaterThanOrEqual(0);
      expect(paragraphs[expIdx + 1]).toBe(roleTitle);
      expect(paragraphs[expIdx + 2]).toContain('Deloitte');
      expect(titleValidation?.experienceRoleTitlesOk).toBe(true);
      expect(titleValidation?.passed).toBe(true);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  });
});

describe('DOCX export integration — Pattern A with missing name in plain text', () => {
  const storedOriginal = [
    'BETSEGAW TEREDA',
    'Senior Data Analyst | Power BI Developer | Washington, DC',
    '(240) 207-1331 | betsegaw.tereda@gmail.com | linkedin.com/in/bestegaw-tereda/',
    'PROFESSIONAL SUMMARY',
    'Summary line',
    'TECHNICAL SKILLS',
    'Languages: SQL, Python',
    'CERTIFICATIONS',
    'Salesforce Administrator Certification',
    'AWS Certified Solutions Architect – Associate',
  ].join('\n');

  const corruptedPlain = storedOriginal.split('\n').slice(1).join('\n');
  const suggestedTitle = 'Senior BI Reporting Analyst | Senior Data Analyst | Power BI Developer';

  it('uses candidate name from snapshot when DOCX plain text drops the name line', async () => {
    const snapshot = createSourceResumeSnapshot(corruptedPlain, {
      storedText: storedOriginal,
      docxPlainText: corruptedPlain,
      docxParagraphs: storedOriginal.split('\n'),
      candidateNameHint: 'BETSEGAW TEREDA',
    });

    expect(snapshot.candidateName).toBe('BETSEGAW TEREDA');
    expect(snapshot.originalCertificationLines).toContain('Salesforce Administrator Certification');

    const sourceBuffer = await buildSourceDocxBuffer(storedOriginal.split('\n'));
    const tailoredText = [
      'Senior Data Analyst | Power BI Developer | Washington, DC',
      'Washington, DC | (240) 207-1331 | betsegaw.tereda@gmail.com | linkedin.com/in/bestegaw-tereda/',
      'Senior BI Reporting Analyst | Senior Data Analyst | Power BI Developer',
      'PROFESSIONAL SUMMARY',
      'Tailored summary.',
      'TECHNICAL SKILLS',
      'Languages: SQL, Python, Salesforce',
      'CERTIFICATIONS',
      'AWS Certified Solutions Architect – Associate',
    ].join('\n');

    const sourceUrl = URL.createObjectURL(
      new Blob([sourceBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );

    try {
      const { blob } = await buildTailoredDocxFromSource(
        sourceUrl,
        [],
        tailoredText,
        snapshot.originalText,
        'Tailored summary.',
        suggestedTitle,
        undefined,
        snapshot,
      );

      const paragraphs = await readDocxParagraphs(await blob.arrayBuffer());
      expect(paragraphs[0]).toBe('BETSEGAW TEREDA');
      expect(paragraphs.some((p) => p.includes('Salesforce Administrator Certification'))).toBe(true);
      expect(paragraphs.filter((p) => p.includes('Senior Data Analyst | Power BI Developer | Washington, DC')).length).toBe(0);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  });
});

describe('Header typography in exported DOCX', () => {
  function paragraphXml(xml: string, index: number): string {
    const re = /<w:p[\s>][\s\S]*?<\/w:p>/g;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(xml)) !== null) {
      if (i === index) return m[0];
      i++;
    }
    return '';
  }

  function runHalfPointSize(pXml: string): number | null {
    const m = pXml.match(/<w:sz w:val="(\d+)"/);
    return m ? Number(m[1]) : null;
  }

  function runIsBold(pXml: string): boolean {
    return /<w:b[\s/>]/.test(pXml) || /<w:b\/>/.test(pXml);
  }

  it('applies name/title/contact font sizes and bold only on name + title (Pattern B)', async () => {
    const original = [
      'JUDY GEBRU',
      'Washington, DC | judy@email.com | 555-555-5555',
      'Senior Financial Analyst | Business Analyst',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'Salesforce Administrator Certification',
    ].join('\n');

    const snapshot = createSourceResumeSnapshot(original, { candidateNameHint: 'JUDY GEBRU' });
    const sourceBuffer = await buildSourceDocxBuffer(original.split('\n'));
    const sourceUrl = URL.createObjectURL(
      new Blob([sourceBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );

    try {
      const { blob } = await buildTailoredDocxFromSource(
        sourceUrl,
        [],
        original,
        original,
        undefined,
        'Senior BI Reporting Analyst | Financial Data Analyst',
        undefined,
        snapshot,
      );

      const xml = await (await JSZip.loadAsync(await blob.arrayBuffer()))
        .file('word/document.xml')
        ?.async('string');
      expect(xml).toBeTruthy();

      const namePara = paragraphXml(xml!, 0);
      const contactPara = paragraphXml(xml!, 1);
      const titlePara = paragraphXml(xml!, 2);

      expect(runHalfPointSize(namePara)).toBe(26);
      expect(runIsBold(namePara)).toBe(true);
      expect(runHalfPointSize(contactPara)).toBe(22);
      expect(runIsBold(contactPara)).toBe(false);
      expect(runHalfPointSize(titlePara)).toBe(24);
      expect(runIsBold(titlePara)).toBe(true);
      expect(namePara.match(/<w:r\b/g)?.length).toBe(1);
      expect(/<w:pStyle/i.test(namePara)).toBe(false);

      const paragraphs = await readDocxParagraphs(await blob.arrayBuffer());
      const summaryIdx = paragraphs.findIndex((p) => p === 'PROFESSIONAL SUMMARY');
      expect(summaryIdx).toBeGreaterThan(2);
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  });
});
