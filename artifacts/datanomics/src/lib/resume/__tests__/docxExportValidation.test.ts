import { describe, expect, it } from 'vitest';

import { validateDocxTitle, ensureCertificationsFromSource } from '../docxTitlePatch';
import { buildExpectedDocxHeaderLines, detectHeaderPattern } from '../resumeHeaderFormat';
import { buildExpectedHeaderFromSnapshot, createSourceResumeSnapshot, isValidSourceSnapshot } from '../sourceResumeSnapshot';

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function docXmlFromParagraphs(lines: string[]): string {
  const body = lines
    .map(
      (line) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`,
    )
    .join('');
  return `<w:document><w:body>${body}</w:body></w:document>`;
}

describe('Header pattern detection and reconstruction', () => {
  it('builds expected header for Pattern A', () => {
    const original = [
      'JOHN DOE',
      'Senior Data Analyst | Power BI Developer | Washington, DC',
      '(555) 555-5555 | john@email.com | linkedin.com/in/johndoe',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'Salesforce Administrator Certification',
    ].join('\n');

    const header = buildExpectedDocxHeaderLines(
      original,
      'Senior BI Reporting Analyst | Power BI Developer',
    );

    expect(header).toEqual([
      'JOHN DOE',
      'Senior BI Reporting Analyst | Power BI Developer',
      'Washington, DC | (555) 555-5555 | john@email.com | linkedin.com/in/johndoe',
    ]);
  });

  it('builds expected header for Pattern B', () => {
    const original = [
      'JANE DOE',
      'Washington, DC | jane@email.com | 555-555-5555',
      'Senior Financial Analyst | Business Analyst | Data & Analytics Consulting',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'Power BI Data Analyst (PL-300) - In Progress',
    ].join('\n');

    const pattern = detectHeaderPattern(original);
    expect(pattern?.lineOrder).toEqual(['name', 'contact', 'title']);

    const header = buildExpectedDocxHeaderLines(
      original,
      'Senior BI Reporting Analyst | Financial Data Analyst',
    );

    expect(header).toEqual([
      'JANE DOE',
      'Washington, DC | jane@email.com | 555-555-5555',
      'Senior BI Reporting Analyst | Financial Data Analyst',
    ]);
  });
});

describe('Certification preservation and bad-header rejection', () => {
  const original = [
    'JOHN DOE',
    'Senior Data Analyst | Power BI Developer',
    'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
    'PROFESSIONAL SUMMARY',
    'Summary line',
    'CERTIFICATIONS',
    'Salesforce Administrator Certification',
    'AWS Certified Solutions Architect - Associate',
    'Power BI Data Analyst (PL-300) - In Progress',
  ].join('\n');

  it('does not treat a skills-line keyword as a preserved certification', () => {
    const suggested = 'Senior BI Reporting Analyst | Power BI Developer';
    const skillsOnlyXml = docXmlFromParagraphs([
      'JOHN DOE',
      'Senior BI Reporting Analyst | Power BI Developer',
      'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'TECHNICAL SKILLS',
      'Analytics: Power BI, SQL, Salesforce',
      'CERTIFICATIONS',
      'AWS Certified Solutions Architect - Associate',
      'Power BI Data Analyst (PL-300) - In Progress',
    ]);

    const validation = validateDocxTitle(skillsOnlyXml, original, suggested);
    expect(validation.certsPreserved).toBe(false);
  });

  it('fails when original certifications are missing and restores them from source XML', () => {
    const suggested = 'Senior BI Reporting Analyst | Power BI Developer';

    const brokenXml = docXmlFromParagraphs([
      'JOHN DOE',
      'Senior BI Reporting Analyst | Power BI Developer',
      'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'AWS Certified Solutions Architect - Associate',
      'Power BI Data Analyst (PL-300) - In Progress',
    ]);

    const validation = validateDocxTitle(brokenXml, original, suggested);
    expect(validation.passed).toBe(false);
    expect(validation.certsPreserved).toBe(false);

    const sourceXml = docXmlFromParagraphs([
      'JOHN DOE',
      'Senior Data Analyst | Power BI Developer',
      'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'Salesforce Administrator Certification',
      'AWS Certified Solutions Architect - Associate',
      'Power BI Data Analyst (PL-300) - In Progress',
    ]);

    const restored = ensureCertificationsFromSource(brokenXml, sourceXml, original);
    expect(restored).toContain('Salesforce Administrator Certification');
    expect(restored).toContain('AWS Certified Solutions Architect - Associate');
    expect(restored).toContain('Power BI Data Analyst (PL-300) - In Progress');
  });

  it('rejects bad generated header order (old title/contact before name)', () => {
    const suggested = 'Senior BI Reporting Analyst | Power BI Developer';
    const badXml = docXmlFromParagraphs([
      'Senior Data Analyst | Power BI Developer',
      'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
      'Senior BI Reporting Analyst | Power BI Developer',
      'JOHN DOE',
      'Washington, DC | 555-555-5555 | john@email.com | linkedin.com/in/johndoe',
      'PROFESSIONAL SUMMARY',
      'Summary line',
      'CERTIFICATIONS',
      'Salesforce Administrator Certification',
      'AWS Certified Solutions Architect - Associate',
      'Power BI Data Analyst (PL-300) - In Progress',
    ]);

    const validation = validateDocxTitle(badXml, original, suggested);
    expect(validation.passed).toBe(false);
    expect(validation.headerBlockExact).toBe(false);
    expect(validation.nameFirst).toBe(false);
  });
});

describe('Immutable source snapshot', () => {
  it('captures immutable header, certs, sections, and contacts', () => {
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

    const snap = createSourceResumeSnapshot(original, { candidateNameHint: 'JANE DOE' });
    expect(snap.candidateName).toBe('JANE DOE');
    expect(snap.detectedHeaderPattern?.lineOrder).toEqual(['name', 'contact', 'title']);
    expect(buildExpectedHeaderFromSnapshot(snap, 'Senior BI Reporting Analyst | Financial Data Analyst')).toEqual([
      'JANE DOE',
      'Washington, DC | jane@email.com | 555-555-5555',
      'Senior BI Reporting Analyst | Financial Data Analyst',
    ]);
    expect(snap.email).toBe('jane@email.com');
    expect(snap.location).toBe('Washington, DC');
    expect(snap.originalCertificationLines).toEqual(['Salesforce Administrator Certification']);
    expect(snap.originalSectionOrder).toEqual([
      'PROFESSIONAL SUMMARY',
      'TECHNICAL SKILLS',
      'CERTIFICATIONS',
    ]);
    expect(snap.originalSkillCategories).toEqual(['Analytics']);
  });

  it('recovers Judy Pattern B when mammoth plain text drops the name line', () => {
    const stored = [
      'JUDY GEBRU',
      'Washington, DC | judy.sintayehu@gmail.com | 202-644-1959',
      'Senior Financial Analyst | Business Analyst | Data & Analytics Consulting',
      'PROFESSIONAL SUMMARY',
      'Summary',
      'CERTIFICATIONS',
      'Cert A',
    ].join('\n');
    const corrupted = stored.split('\n').slice(1).join('\n');

    const snap = createSourceResumeSnapshot(corrupted, {
      storedText: stored,
      docxPlainText: corrupted,
      docxParagraphs: stored.split('\n'),
      candidateNameHint: 'JUDY GEBRU',
    });

    expect(isValidSourceSnapshot(snap)).toBe(true);
    expect(snap.candidateName).toBe('JUDY GEBRU');
    expect(snap.detectedHeaderPattern?.lineOrder).toEqual(['name', 'contact', 'title']);
    expect(buildExpectedHeaderFromSnapshot(snap, 'Senior BI Reporting Analyst | Financial Data Analyst')[0]).toBe(
      'JUDY GEBRU',
    );
  });

  it('recovers Betsegaw Pattern A when plain text starts with the old title line', () => {
    const stored = [
      'BETSEGAW TEREDA',
      'Senior Data Analyst | Power BI Developer | Washington, DC',
      '(240) 207-1331 | betsegaw.tereda@gmail.com | linkedin.com/in/bestegaw-tereda/',
      'PROFESSIONAL SUMMARY',
      'Summary',
      'CERTIFICATIONS',
      'Salesforce Administrator Certification',
    ].join('\n');
    const corrupted = stored.split('\n').slice(1).join('\n');

    const snap = createSourceResumeSnapshot(corrupted, {
      storedText: stored,
      docxPlainText: corrupted,
      docxParagraphs: stored.split('\n'),
      candidateNameHint: 'BETSEGAW TEREDA',
    });

    expect(isValidSourceSnapshot(snap)).toBe(true);
    expect(snap.candidateName).toBe('BETSEGAW TEREDA');
    expect(snap.originalCertificationLines).toContain('Salesforce Administrator Certification');
    expect(buildExpectedHeaderFromSnapshot(snap, 'Senior BI Reporting Analyst | Power BI Developer')[0]).toBe(
      'BETSEGAW TEREDA',
    );
  });
});
