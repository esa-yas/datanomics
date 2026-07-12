import { isJobMetadataLine, isProtectedResumeLine, sanitizeBulletText } from '@/lib/resume/resumeLines';
import {
  educationAndCertsPreserved,
  extractJdTitle,
  extractResumeVocabulary,
  findSkillsBlock,
  getLineRegion,
  isHeadlineOrTitleLine,
  isJobTitleOnly,
  isLikelyJobTitleLine,
  isMultiTitleHeadline,
  isSkillCategoryLine,
  lineToJobIndex,
  getSkillsSectionHeading,
  noJobTitleInSkills,
  noStrayTitleInExperience,
  normalizeLine,
  originalContainsLine,
  parseResumeStructure,
  sectionOrderIntact,
  skillCategoriesPreserved,
  skillCategoryName,
} from '@/lib/resume/resumeStructure';
import { extractHeaderLocation } from '@/lib/resume/resumeHeaderFormat';
import {
  countJdTermHits,
  extractJdSkillPhrases,
  skillsSectionEnhanced,
  summaryMeetsDepth,
  unsupportedSkillAdditions,
  unsupportedSummaryTools,
} from '@/lib/resume/tailorDepth';
import {
  buildSkillEnhancementChanges,
  countEnhancedSkillLines,
  enhanceSkillsInPlainText,
  targetSkillEnhancementCount,
} from '@/lib/resume/skillsTailor';
import type { ResumeSectionChange, TailorResult, TailorValidationResult, TailoringSummary } from '@/lib/utils/resumeTailor';
import { buildTailoredText, extractSummaryText } from '@/lib/utils/resumeTailor';

export interface ValidationCheck {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

/** Known tech tokens — if new ones appear in a change, they must exist in resume vocab. */
const TECH_TOKEN = /\b(?:Power BI|DAX|Power Query|Tableau|SQL|Python|JavaScript|Java|Snowflake|dbt|Airflow|AWS|Azure|GCP|Alteryx|Excel|Looker|Salesforce|SOQL|Fivetran|Spark|Hadoop|Kubernetes|Docker|Git|R\b|MATLAB|SAS|SPSS|SSIS|ETL|ELT)\b/gi;

function unsupportedToolsInText(originalText: string, newText: string): string[] {
  // A tool is "fabricated" only if it does not appear ANYWHERE in the original resume.
  const origLower = originalText.toLowerCase();
  const vocab = extractResumeVocabulary(originalText);
  const unsupported: string[] = [];
  const matches = newText.match(TECH_TOKEN) ?? [];
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (origLower.includes(lower) || vocab.has(lower)) continue;
    unsupported.push(m);
  }
  return [...new Set(unsupported)];
}

function isWeakBullet(text: string): boolean {
  const t = sanitizeBulletText(text);
  if (t.length < 25) return true;
  if (/^responsible for/i.test(t)) return true;
  if (!/\b(led|built|delivered|developed|designed|created|automated|optimized|drove|managed|implemented|analyzed|reduced|increased|improved)\b/i.test(t)) {
    return t.length < 60;
  }
  return false;
}

function maxChangesForJob(jobIndex: number): number {
  if (jobIndex <= 0) return 4;
  if (jobIndex === 1) return 2;
  return 1;
}

export function sanitizeSectionChange(
  change: ResumeSectionChange,
  originalText: string,
  structure: ReturnType<typeof parseResumeStructure>,
  jobChangeCounts: Map<number, number>,
  jdText = '',
): { change: ResumeSectionChange | null; reason?: string } {
  const original = sanitizeBulletText(change.original || '');
  const tailored = sanitizeBulletText(change.tailored || '');
  if (!original || !tailored || original === tailored) {
    return { change: null, reason: 'empty or identical' };
  }

  if (!originalContainsLine(originalText, original)) {
    return { change: null, reason: 'original line not in resume' };
  }

  if (isProtectedResumeLine(original) || isJobMetadataLine(original)) {
    return { change: null, reason: 'protected metadata/header line' };
  }

  // Never allow a JD job title / headline to be inserted as any line content.
  if (isMultiTitleHeadline(tailored)) {
    return { change: null, reason: 'tailored value is a pipe-joined headline' };
  }
  if (isJobTitleOnly(tailored)) {
    return { change: null, reason: 'tailored value is a job title, not content' };
  }
  if (isHeadlineOrTitleLine(tailored) && !isHeadlineOrTitleLine(original)) {
    return { change: null, reason: 'replaced content with a headline/title' };
  }

  if (isLikelyJobTitleLine(tailored) && !isLikelyJobTitleLine(original)) {
    return { change: null, reason: 'replaced content with job title' };
  }

  const origRegion = getLineRegion(originalText, original);
  const titleLike =
    isHeadlineOrTitleLine(tailored) ||
    isLikelyJobTitleLine(tailored) ||
    isMultiTitleHeadline(tailored) ||
    isJobTitleOnly(tailored);
  if (origRegion && origRegion !== 'header' && titleLike && !isHeadlineOrTitleLine(original)) {
    return { change: null, reason: 'title injected outside header' };
  }

  // Technical Skills protection: a skill category line may only become the SAME
  // category line, and it must keep every original skill token.
  if (isSkillCategoryLine(original)) {
    if (!isSkillCategoryLine(tailored)) {
      return { change: null, reason: 'skill category structure broken' };
    }
    const origCat = skillCategoryName(original);
    const newCat = skillCategoryName(tailored);
    if (!newCat || origCat?.toLowerCase() !== newCat.toLowerCase()) {
      return { change: null, reason: 'skill category renamed or removed' };
    }
    const origTokens = original
      .split(':')
      .slice(1)
      .join(':')
      .split(/[,|·•/]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const tailoredLower = tailored.toLowerCase();
    if (!origTokens.every((t) => tailoredLower.includes(t))) {
      return { change: null, reason: 'skill category dropped original tools' };
    }
  }

  // A non-skill line must never be rewritten INTO a skill category line.
  if (!isSkillCategoryLine(original) && isSkillCategoryLine(tailored)) {
    return { change: null, reason: 'non-skill line turned into skill category' };
  }

  if (isSkillCategoryLine(original)) {
    const skillBad = unsupportedSkillAdditions(original, tailored, originalText, jdText);
    if (skillBad.length > 0) {
      return { change: null, reason: `unsupported skill additions: ${skillBad.join(', ')}` };
    }
  } else {
    const unsupported = unsupportedToolsInText(originalText, tailored);
    if (unsupported.length > 0) {
      return { change: null, reason: `unsupported tools: ${unsupported.join(', ')}` };
    }
  }

  if (isWeakBullet(tailored) && !isWeakBullet(original)) {
    return { change: null, reason: 'weaker bullet than original' };
  }

  if (tailored.length < original.length * 0.45) {
    return { change: null, reason: 'excessive content removal' };
  }

  const jobIdx = lineToJobIndex(originalText, original);
  if (jobIdx != null) {
    const count = jobChangeCounts.get(jobIdx) ?? 0;
    if (count >= maxChangesForJob(jobIdx)) {
      return { change: null, reason: `edit limit for job block ${jobIdx}` };
    }
    jobChangeCounts.set(jobIdx, count + 1);
  }

  if (/^(EDUCATION|CERTIFICATION)/i.test(change.label) && !/summary|skill/i.test(change.label)) {
    return { change: null, reason: 'education/cert lines are protected' };
  }

  return { change: { ...change, original, tailored } };
}

export function sanitizeTailorResult(
  originalText: string,
  result: TailorResult,
  jdText = '',
): {
  result: TailorResult;
  rejected: string[];
} {
  const structure = parseResumeStructure(originalText);
  const jobChangeCounts = new Map<number, number>();
  const rejected: string[] = [];
  const sectionChanges: ResumeSectionChange[] = [];

  for (const raw of result.sectionChanges ?? []) {
    const { change, reason } = sanitizeSectionChange(raw, originalText, structure, jobChangeCounts, jdText);
    if (change) sectionChanges.push(change);
    else if (reason) rejected.push(`${raw.label || 'edit'}: ${reason}`);
  }

  let optimizedSummary = sanitizeBulletText(result.optimizedSummary || '');
  if (optimizedSummary) {
    const unsupported = jdText
      ? unsupportedSummaryTools(originalText, jdText, optimizedSummary)
      : unsupportedToolsInText(originalText, optimizedSummary);
    if (unsupported.length > 0) {
      rejected.push(`summary: unsupported tools ${unsupported.join(', ')}`);
      optimizedSummary = '';
    }
    if (optimizedSummary.length < 100) {
      rejected.push('summary: too short');
      optimizedSummary = '';
    }
  }

  let suggestedTitle = sanitizeBulletText(result.suggestedTitle || '');
  if (suggestedTitle) {
    if (isSkillCategoryLine(suggestedTitle) || structure.skillCategories.some((c) => normalizeLine(c) === normalizeLine(suggestedTitle))) {
      rejected.push('title: looked like skill category');
      suggestedTitle = '';
    }
    const headline = structure.headerLines[structure.headerLines.length - 1] ?? '';
    if (headline && normalizeLine(suggestedTitle) === normalizeLine(headline)) {
      suggestedTitle = '';
    }
  }

  return {
    result: {
      ...result,
      sectionChanges,
      optimizedSummary,
      suggestedTitle,
      optimizedSkills: [],
    },
    rejected,
  };
}

export function validateTailoredResume(
  originalText: string,
  tailoredText: string,
  result: TailorResult,
  rejected: string[],
  jdText = '',
): TailorValidationResult {
  const orig = parseResumeStructure(originalText);
  const tail = parseResumeStructure(tailoredText);
  const autoRevisions: string[] = [...rejected];

  const checks: ValidationCheck[] = [
    {
      id: 'section_order',
      label: 'Section order unchanged',
      passed: sectionOrderIntact(originalText, tailoredText),
    },
    {
      id: 'header',
      label: 'Header/contact preserved',
      passed: (() => {
        const loc = extractHeaderLocation(originalText);
        if (loc) return tailoredText.toLowerCase().includes(loc.toLowerCase());
        return orig.headerLines.every((h) => tailoredText.includes(h));
      })(),
      detail: orig.headerLines.length ? undefined : 'no header detected',
    },
    {
      id: 'job_metadata',
      label: 'Company names and dates unchanged',
      passed:
        orig.jobMetadataLines.length === tail.jobMetadataLines.length &&
        orig.jobMetadataLines.every((m, i) => normalizeLine(m) === normalizeLine(tail.jobMetadataLines[i] ?? '')),
    },
    {
      id: 'skill_categories',
      label: 'Skill categories preserved',
      passed: skillCategoriesPreserved(originalText, tailoredText),
      detail: orig.skillCategories.length ? orig.skillCategories.join(', ') : 'no skills section',
    },
    {
      id: 'no_title_in_skills',
      label: 'No JD title inside Technical Skills',
      passed: noJobTitleInSkills(tailoredText),
    },
    {
      id: 'no_title_in_experience',
      label: 'No headline/target-role inserted as a bullet',
      passed: noStrayTitleInExperience(originalText, tailoredText),
    },
    {
      id: 'education_certs',
      label: 'Education & certifications unchanged',
      passed: educationAndCertsPreserved(originalText, tailoredText),
    },
    {
      id: 'no_fake_tools',
      label: 'No fabricated tools/skills added',
      passed: unsupportedToolsInText(originalText, tailoredText).length === 0,
      detail: unsupportedToolsInText(originalText, tailoredText).join(', ') || undefined,
    },
    {
      id: 'line_count',
      label: 'Content not heavily deleted',
      passed: tail.lineCount >= orig.lineCount * 0.85,
      detail: `${orig.lineCount} → ${tail.lineCount} lines`,
    },
    {
      id: 'no_duplicates',
      label: 'No duplicate job lines',
      passed: new Set(tail.jobMetadataLines.map(normalizeLine)).size === tail.jobMetadataLines.length,
    },
    {
      id: 'summary_depth',
      label: 'Professional Summary reflects JD keywords',
      passed:
        !result.optimizedSummary?.trim() ||
        !jdText ||
        summaryMeetsDepth(extractSummaryText(originalText), result.optimizedSummary, jdText),
      detail: result.optimizedSummary?.trim()
        ? `${countJdTermHits(result.optimizedSummary, jdText)} JD terms`
        : 'no summary rewrite',
    },
    {
      id: 'skills_enhanced',
      label: 'Technical Skills include supported JD phrases',
      passed: (() => {
        if (!jdText) return true;
        const catCount = orig.skillCategories.length;
        if (!catCount) return true;
        const minLines = targetSkillEnhancementCount(catCount, 4);
        const enhanced = countEnhancedSkillLines(originalText, tailoredText, jdText);
        return enhanced >= minLines || skillsSectionEnhanced(originalText, tailoredText, jdText);
      })(),
      detail: jdText
        ? `${countEnhancedSkillLines(originalText, tailoredText, jdText)} skill lines with JD keywords`
        : 'supported keywords under existing categories',
    },
    {
      id: 'has_edits',
      label: 'Resume improved for JD',
      passed:
        result.sectionChanges.length > 0 ||
        !!result.optimizedSummary?.trim() ||
        !!result.suggestedTitle?.trim(),
    },
    {
      id: 'ats_safe',
      label: 'ATS-friendly (no bullet chars in text)',
      passed: !/[•\-\–*●▪◦‣▸►]\s+\w/.test(tailoredText),
    },
  ];

  // These must ALWAYS pass — failing any one means the resume was structurally damaged.
  const MANDATORY = new Set([
    'section_order',
    'job_metadata',
    'skill_categories',
    'no_title_in_skills',
    'no_title_in_experience',
    'education_certs',
    'no_fake_tools',
    'no_duplicates',
    'has_edits',
  ]);

  const mandatoryOk = checks.filter((c) => MANDATORY.has(c.id)).every((c) => c.passed);
  const softFailures = checks.filter((c) => !MANDATORY.has(c.id) && !c.passed).length;
  const passed = mandatoryOk && softFailures <= 1;

  return {
    passed,
    checks,
    rejectedChangeCount: rejected.length,
    autoRevisions,
  };
}

export function buildTailoringSummary(
  result: TailorResult,
  validation: TailorValidationResult,
  structure: ReturnType<typeof parseResumeStructure>,
  jdTitle?: string,
  originalText?: string,
  jdText?: string,
): TailoringSummary {
  const sectionsUpdated = new Set<string>();
  const skillsSectionLabel =
    (originalText && getSkillsSectionHeading(originalText)) || 'Skills';

  for (const c of result.sectionChanges) {
    if (/summary/i.test(c.label)) sectionsUpdated.add('Professional Summary');
    else if (/experience|bullet|work/i.test(c.label)) sectionsUpdated.add(c.label || 'Professional Experience');
    else if (c.original !== c.tailored && !/skill/i.test(c.label)) {
      sectionsUpdated.add(c.label || 'Experience');
    }
  }
  const tailoredBuilt = originalText ? buildTailoredText(originalText, result, jdText ?? '') : '';
  const origSummary = originalText ? extractSummaryText(originalText) : null;
  const newSummary = tailoredBuilt ? extractSummaryText(tailoredBuilt) : null;

  if (
    result.optimizedSummary?.trim() &&
    originalText &&
    newSummary &&
    origSummary !== newSummary &&
    (!jdText || summaryMeetsDepth(origSummary, result.optimizedSummary, jdText))
  ) {
    sectionsUpdated.add('Professional Summary');
  }
  if (result.suggestedTitle?.trim()) sectionsUpdated.add('Headline');

  const origSkillBlock = originalText ? findSkillsBlock(originalText) : null;
  const skillCategoryCount = origSkillBlock
    ? origSkillBlock.lines.filter(isSkillCategoryLine).length
    : 0;
  const jdPhraseCount = jdText ? extractJdSkillPhrases(jdText).length : 0;
  const targetSkillLines =
    skillCategoryCount > 0 && jdPhraseCount >= 2
      ? targetSkillEnhancementCount(skillCategoryCount, jdPhraseCount)
      : 0;
  const skillEnhancedCount =
    originalText && jdText ? countEnhancedSkillLines(originalText, tailoredBuilt, jdText) : 0;
  if (targetSkillLines > 0 && skillEnhancedCount >= targetSkillLines) {
    sectionsUpdated.add(skillsSectionLabel);
  }

  return {
    jdTitle: jdTitle || undefined,
    jdKeywordsUsed: result.addedKeywords ?? [],
    sectionsUpdated: [...sectionsUpdated],
    skillsPreserved: structure.skillCategories,
    unsupportedNotAdded: result.missingKeywords ?? [],
    validation,
  };
}

/** Drop lowest-priority changes until validation passes. */
export function reduceResultUntilValid(
  originalText: string,
  result: TailorResult,
  buildFn: (orig: string, r: TailorResult) => string,
  jdText = '',
): { result: TailorResult; rejected: string[] } {
  let current = { ...result, sectionChanges: [...result.sectionChanges] };
  let { result: sanitized, rejected } = sanitizeTailorResult(originalText, current, jdText);
  let tailored = buildFn(originalText, sanitized);
  let validation = validateTailoredResume(originalText, tailored, sanitized, rejected, jdText);

  while (!validation.passed && sanitized.sectionChanges.length > 1) {
    const dropped = sanitized.sectionChanges.pop()!;
    rejected.push(`auto-removed: ${dropped.label || 'edit'} (validation)`);
    sanitized = sanitizeTailorResult(originalText, { ...sanitized, sectionChanges: sanitized.sectionChanges }, jdText).result;
    tailored = buildFn(originalText, sanitized);
    validation = validateTailoredResume(originalText, tailored, sanitized, rejected, jdText);
  }

  return { result: sanitized, rejected };
}

/**
 * JD-title quarantine: the JD title may ONLY influence the headline (suggestedTitle) and
 * summary wording — never a skill line or experience bullet. Drop any section change whose
 * tailored value is (or merely contains) the JD title as standalone content.
 */
function quarantineJdTitle(result: TailorResult, jdTitle: string | null): TailorResult {
  if (!jdTitle) return result;
  const jdNorm = normalizeLine(jdTitle);
  const sectionChanges = result.sectionChanges.filter((c) => {
    const tailoredNorm = normalizeLine(c.tailored);
    return tailoredNorm !== jdNorm && !isJobTitleOnly(c.tailored);
  });
  return { ...result, sectionChanges };
}

export function finalizeTailorResult(
  originalText: string,
  raw: TailorResult,
  jdText?: string,
): TailorResult {
  const structure = parseResumeStructure(originalText);
  const jdTitle = jdText ? extractJdTitle(jdText) : null;
  const jd = jdText ?? '';

  let { result, rejected } = sanitizeTailorResult(originalText, quarantineJdTitle(raw, jdTitle), jd);
  let tailored = buildTailoredText(originalText, result, jd);

  if (jd && parseResumeStructure(originalText).skillCategories.length) {
    const autoSkillChanges = buildSkillEnhancementChanges(
      originalText,
      tailored,
      jd,
      result.sectionChanges,
    );
    if (autoSkillChanges.length) {
      const structure = parseResumeStructure(originalText);
      const jobChangeCounts = new Map<number, number>();
      const merged = [...result.sectionChanges];
      for (const rawChange of autoSkillChanges) {
        const dup = merged.some(
          (c) =>
            isSkillCategoryLine(c.original) &&
            skillCategoryName(c.original)?.toLowerCase() ===
              skillCategoryName(rawChange.original)?.toLowerCase(),
        );
        if (dup) continue;
        const { change, reason } = sanitizeSectionChange(
          rawChange,
          originalText,
          structure,
          jobChangeCounts,
          jd,
        );
        if (change) merged.push(change);
        else if (reason) rejected.push(`auto-skill: ${reason}`);
      }
      if (merged.length > result.sectionChanges.length) {
        result = { ...result, sectionChanges: merged };
        tailored = buildTailoredText(originalText, result, jd);
      }
    }

    const plainEnhanced = enhanceSkillsInPlainText(originalText, tailored, jd);
    if (plainEnhanced !== tailored) {
      tailored = plainEnhanced;
    }
  }

  let validation = validateTailoredResume(originalText, tailored, result, rejected, jd);

  if (!validation.passed) {
    const reduced = reduceResultUntilValid(
      originalText,
      result,
      (orig, r) => buildTailoredText(orig, r, jd),
      jd,
    );
    result = reduced.result;
    rejected = reduced.rejected;
    tailored = buildTailoredText(originalText, result, jd);
    if (jd && parseResumeStructure(originalText).skillCategories.length) {
      tailored = enhanceSkillsInPlainText(originalText, tailored, jd);
    }
    validation = validateTailoredResume(originalText, tailored, result, rejected, jd);
  }

  const tailoringSummary = buildTailoringSummary(
    result,
    validation,
    structure,
    jdTitle ?? undefined,
    originalText,
    jd,
  );

  return {
    ...result,
    tailoringSummary,
    overallFeedback:
      result.overallFeedback ||
      (tailoringSummary.validation.passed
        ? 'Tailored with structure preserved — review the summary below.'
        : 'Some edits were trimmed to protect your resume structure.'),
  };
}
