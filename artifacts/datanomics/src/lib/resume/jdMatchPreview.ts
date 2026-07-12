import type { TextSegment } from '@/lib/utils/resumeTailor';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'will', 'have', 'has', 'are', 'was',
  'you', 'your', 'our', 'their', 'they', 'them', 'who', 'what', 'when', 'where', 'which',
  'about', 'into', 'over', 'such', 'than', 'then', 'also', 'able', 'work', 'team', 'role',
  'job', 'years', 'year', 'experience', 'required', 'preferred', 'including', 'using', 'use',
  'ability', 'strong', 'excellent', 'good', 'well', 'high', 'new', 'make', 'help', 'support',
]);

/** High-value skills recruiters and ATS systems weight heavily. */
const IMPACT_TERMS = new Set([
  'power bi', 'tableau', 'sql', 'python', 'r', 'excel', 'snowflake', 'dbt', 'airflow', 'spark',
  'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'etl', 'elt', 'api', 'rest', 'git', 'jira',
  'salesforce', 'looker', 'dax', 'pandas', 'numpy', 'scikit', 'machine learning', 'ml', 'ai',
  'data warehouse', 'data modeling', 'data governance', 'stakeholder', 'cross-functional',
  'kpi', 'roi', 'dashboard', 'visualization', 'analytics', 'bi', 'saas', 'agile', 'scrum',
]);

const MUST_HAVE_RE =
  /(?:required|must have|must-have|minimum|essential|mandatory|qualifications?)[:\s-]*([^\n.;]{4,120})/gi;

function normalizePhrase(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function singleWordTokens(text: string): string[] {
  const matches = text.toLowerCase().match(/\b[a-z][a-z0-9+#./-]{2,}\b/g) || [];
  return [...new Set(matches)].filter((w) => !STOP_WORDS.has(w));
}

function phraseTokens(text: string): string[] {
  const phrases: string[] = [];
  const quoted = text.match(/"([^"]{3,60})"|'([^']{3,60})'/g) || [];
  for (const q of quoted) {
    const inner = q.slice(1, -1).trim();
    if (inner.length >= 3) phrases.push(normalizePhrase(inner));
  }

  const lower = text.toLowerCase();
  for (const term of IMPACT_TERMS) {
    if (lower.includes(term)) phrases.push(term);
  }

  const bigrams = text.toLowerCase().match(/\b[a-z]{3,}\s+[a-z]{3,}\b/g) || [];
  for (const bg of bigrams) {
    const n = normalizePhrase(bg);
    if (IMPACT_TERMS.has(n)) phrases.push(n);
  }

  return [...new Set(phrases)];
}

function extractMustHaveTerms(jd: string): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(MUST_HAVE_RE.source, 'gi');
  while ((m = re.exec(jd)) !== null) {
    const chunk = m[1];
    found.push(...singleWordTokens(chunk), ...phraseTokens(chunk));
  }
  return [...new Set(found.map(normalizePhrase))];
}

export interface JdKeywordAnalysis {
  term: string;
  inResume: boolean;
  impact: boolean;
  mustHave: boolean;
}

export interface JdMatchPreview {
  score: number;
  matched: string[];
  missing: string[];
  totalKeywords: number;
  impactMatched: string[];
  impactMissing: string[];
  mustHaveMissing: string[];
  recruiterTips: string[];
  keywords: JdKeywordAnalysis[];
}

function buildRecruiterTips(preview: Omit<JdMatchPreview, 'recruiterTips' | 'keywords'>): string[] {
  const tips: string[] = [];
  if (preview.score < 50) {
    tips.push('Lead your summary with 3–4 must-have skills from the job posting.');
  }
  if (preview.impactMissing.length > 0) {
    tips.push(`Add high-impact terms: ${preview.impactMissing.slice(0, 4).join(', ')}.`);
  }
  if (preview.mustHaveMissing.length > 0) {
    tips.push(`Address required qualifications: ${preview.mustHaveMissing.slice(0, 3).join(', ')}.`);
  }
  tips.push('Use metrics (%, $, time saved) in bullet points — recruiters scan numbers first.');
  tips.push('Mirror the job title and top keywords in your headline and summary.');
  return tips.slice(0, 5);
}

export function computeJdMatchPreview(jd: string, resumeText: string): JdMatchPreview {
  const words = singleWordTokens(jd);
  const phrases = phraseTokens(jd);
  const mustHave = extractMustHaveTerms(jd);
  const allTerms = [...new Set([...words, ...phrases, ...mustHave.map(normalizePhrase)])];

  if (!allTerms.length) {
    return {
      score: 0,
      matched: [],
      missing: [],
      totalKeywords: 0,
      impactMatched: [],
      impactMissing: [],
      mustHaveMissing: [],
      recruiterTips: ['Paste a job description to see keyword match and recruiter tips.'],
      keywords: [],
    };
  }

  const resumeLower = resumeText.toLowerCase();
  const keywords: JdKeywordAnalysis[] = allTerms.map((term) => {
    const impact = IMPACT_TERMS.has(term) || term.length > 8;
    const mustHaveTerm = mustHave.includes(term);
    const inResume = resumeLower.includes(term);
    return { term, inResume, impact, mustHave: mustHaveTerm };
  });

  const matched = keywords.filter((k) => k.inResume).map((k) => k.term);
  const missing = keywords.filter((k) => !k.inResume).map((k) => k.term);
  const impactMatched = keywords.filter((k) => k.inResume && k.impact).map((k) => k.term);
  const impactMissing = keywords.filter((k) => !k.inResume && k.impact).map((k) => k.term);
  const mustHaveMissing = keywords.filter((k) => !k.inResume && k.mustHave).map((k) => k.term);

  const score = Math.round((matched.length / allTerms.length) * 100);

  const base = {
    score,
    matched: matched.slice(0, 30),
    missing: missing.slice(0, 24),
    totalKeywords: allTerms.length,
    impactMatched: impactMatched.slice(0, 16),
    impactMissing: impactMissing.slice(0, 12),
    mustHaveMissing: mustHaveMissing.slice(0, 10),
  };

  return {
    ...base,
    recruiterTips: buildRecruiterTips(base),
    keywords,
  };
}

function termVariant(term: string, keywords: JdKeywordAnalysis[]): TextSegment['variant'] {
  const row = keywords.find((k) => k.term === term);
  if (!row) return 'keyword';
  return row.impact ? 'impact' : 'keyword';
}

/** Highlight JD keywords found in the resume (live while typing job description). */
export function buildJdHighlightSegments(resumeText: string, jd: string): TextSegment[] {
  if (!resumeText.trim()) {
    return [{ text: '', changed: false }];
  }
  if (!jd.trim()) {
    return [{ text: resumeText, changed: false }];
  }

  const analysis = computeJdMatchPreview(jd, resumeText);
  const matchedTerms = analysis.keywords.filter((k) => k.inResume).map((k) => k.term);
  if (!matchedTerms.length) {
    return [{ text: resumeText, changed: false }];
  }

  const sorted = [...matchedTerms].sort((a, b) => b.length - a.length);
  const lower = resumeText.toLowerCase();
  const ranges: { start: number; end: number; variant: TextSegment['variant'] }[] = [];

  for (const kw of sorted) {
    const kwLower = kw.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(kwLower, from);
      if (idx === -1) break;
      const end = idx + kw.length;
      const overlaps = ranges.some((r) => !(end <= r.start || idx >= r.end));
      if (!overlaps) {
        ranges.push({ start: idx, end, variant: termVariant(kw, analysis.keywords) });
      }
      from = idx + kw.length;
    }
  }

  if (!ranges.length) return [{ text: resumeText, changed: false }];

  ranges.sort((a, b) => a.start - b.start);
  const merged: typeof ranges = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      if (r.variant === 'impact') last.variant = 'impact';
    } else {
      merged.push({ ...r });
    }
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const { start, end, variant } of merged) {
    if (start > cursor) {
      segments.push({ text: resumeText.slice(cursor, start), changed: false });
    }
    segments.push({ text: resumeText.slice(start, end), changed: true, variant });
    cursor = end;
  }
  if (cursor < resumeText.length) {
    segments.push({ text: resumeText.slice(cursor), changed: false });
  }

  return segments.filter((s) => s.text.length > 0);
}
