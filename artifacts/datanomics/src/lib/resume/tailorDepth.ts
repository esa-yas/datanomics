import { sanitizeBulletText } from '@/lib/resume/resumeLines';
import { isSkillCategoryLine, skillCategoryName } from '@/lib/resume/resumeStructure';

/** JD themes commonly woven into summaries and skills (not hard-tool claims). */
const JD_THEME_PHRASES =
  /\b(fp&a analytics|fp&a|financial planning & analysis|kpi dashboards?|executive kpi dashboards|scenario analysis|automated financial reporting workflows?|reporting automation|kpi documentation|governance standards|data reconciliation|variance analysis|financial reporting|financial modeling|budget forecasting|month-end close|management reporting|revenue analytics|sales performance reporting|sales analytics|pipeline reporting|revenue forecasting|customer lifecycle analytics|revenue operations|revops|quota attainment|bookings|arr|mrr|sales pipeline|crm reporting|salesforce analytics|crm analytics|product analytics|marketing analytics|campaign performance|attribution models?|funnel analysis|customer acquisition|marketing roi|customer journey|funnel|onboarding trends|onboarding|retention metrics|retention|churn analysis|churn|a\/b testing|a\/b test|experimentation|product kpis?|self-service analytics|self-service|cohort analysis|engagement metrics|conversion rate|user behavior|feature adoption|kpi development|dashboards|data visualization|stakeholder reporting|cross-functional|product data|marketing dashboards|lead generation|demand generation|multi-touch attribution)\b/gi;

/** Multi-word skill phrases extracted from JD text. */
const JD_SKILL_PHRASE_RE =
  /\b(fp&a analytics|fp&a|kpi dashboards?|executive kpi dashboards|scenario analysis|automated financial reporting workflows?|reporting automation|kpi documentation|governance standards|data reconciliation|reconciliation|variance analysis|financial reporting|financial modeling|budget forecasting|forecasting|management reporting|month-end close|data governance|stakeholder reporting|executive reporting|forecasting models?|financial dashboards?|dashboard qa)\b/gi;

const HARD_TOOL =
  /\b(?:Power BI|DAX|Power Query|Tableau|SQL|Python|Snowflake|dbt|Airflow|AWS|Azure|Salesforce|SOQL|Fivetran|Looker|Excel|SSIS|Spark|Kubernetes|Docker|Git|PostgreSQL|Redshift)\b/gi;

/** Pull JD-relevant terms for alignment checks. */
export function extractJdKeywords(jdText: string): string[] {
  const found = new Set<string>();
  const lower = jdText.toLowerCase();

  for (const m of jdText.match(JD_THEME_PHRASES) ?? []) found.add(m.toLowerCase().trim());
  for (const m of lower.match(HARD_TOOL) ?? []) found.add(m.toLowerCase());

  for (const line of jdText.split('\n')) {
    const cleaned = line.replace(/^[\s\-•*]+/, '').trim();
    if (cleaned.length < 4 || cleaned.length > 60) continue;
    if (/^(requirements?|responsibilities|qualifications|about|role)/i.test(cleaned)) continue;
    if (/\b(analyst|engineer|developer|manager|specialist)\b/i.test(cleaned)) {
      found.add(cleaned.toLowerCase());
    }
  }

  return [...found];
}

/** JD skill phrases suitable for appending to category lines. */
export function extractJdSkillPhrases(jdText: string): string[] {
  const found = new Set<string>();

  for (const m of jdText.match(JD_SKILL_PHRASE_RE) ?? []) {
    found.add(formatSkillPhrase(m));
  }
  for (const m of jdText.match(JD_THEME_PHRASES) ?? []) {
    found.add(formatSkillPhrase(m));
  }
  for (const term of extractJdKeywords(jdText)) {
    if (term.length >= 4 && term.length <= 45) found.add(formatSkillPhrase(term));
  }

  return [...found].filter((p) => p.length >= 3 && !/^(senior|junior|lead)\s/.test(p));
}

function formatSkillPhrase(raw: string): string {
  const t = raw.trim();
  if (/^[a-z]/.test(t) && t.includes('&')) {
    return t
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
      .replace(/Fp&a/i, 'FP&A');
  }
  if (/^fp&a/i.test(t)) return 'FP&A Analytics';
  if (/^kpi dashboard/i.test(t)) return 'KPI Dashboards';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function countJdTermHits(text: string, jdText: string): number {
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of extractJdKeywords(jdText)) {
    if (term.length >= 3 && lower.includes(term)) hits++;
  }
  return hits;
}

/** True when the new summary is meaningfully different and JD-aligned. */
export function summaryMeetsDepth(
  originalSummary: string | null,
  newSummary: string,
  jdText: string,
): boolean {
  const trimmed = sanitizeBulletText(newSummary);
  if (!trimmed || trimmed.length < 120) return false;

  const orig = sanitizeBulletText(originalSummary || '');
  if (orig && normalizeForCompare(orig) === normalizeForCompare(trimmed)) return false;

  return countJdTermHits(trimmed, jdText) >= 2;
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Tokens newly added on a skill line — only the delta after the colon. */
function newSkillTokens(originalLine: string, tailoredLine: string): string[] {
  const origAfter = originalLine.split(':').slice(1).join(':').toLowerCase();
  const tailAfter = tailoredLine.split(':').slice(1).join(':').toLowerCase();
  const origSet = new Set(
    origAfter.split(/[,|·•/]/).map((s) => s.trim()).filter(Boolean),
  );
  return tailAfter
    .split(/[,|·•/]/)
    .map((s) => s.trim())
    .filter((t) => t && !origSet.has(t));
}

/** A newly added skill phrase is OK if it appears in the JD or is a supported analytics/finance theme. */
export function isJdSupportedSkillPhrase(phrase: string, jdText: string, originalText: string): boolean {
  const p = phrase.toLowerCase().trim();
  if (!p) return false;
  if (originalText.toLowerCase().includes(p)) return true;
  if (jdText.toLowerCase().includes(p)) return true;
  if (JD_THEME_PHRASES.test(p)) return true;
  if (JD_SKILL_PHRASE_RE.test(p)) return true;
  // Partial match against JD skill phrases (e.g. "Scenario Analysis" vs "scenario analysis")
  for (const jdPhrase of extractJdSkillPhrases(jdText)) {
    const j = jdPhrase.toLowerCase();
    if (j.includes(p) || p.includes(j)) return true;
  }
  return false;
}

/** Hard tools newly introduced on a skill line that are not in resume or JD. */
export function unsupportedSkillAdditions(
  originalLine: string,
  tailoredLine: string,
  originalText: string,
  jdText: string,
): string[] {
  const bad: string[] = [];
  for (const token of newSkillTokens(originalLine, tailoredLine)) {
    if (isJdSupportedSkillPhrase(token, jdText, originalText)) continue;

    const hardMatches = token.match(HARD_TOOL);
    if (hardMatches) {
      for (const h of hardMatches) {
        const t = h.toLowerCase();
        if (originalText.toLowerCase().includes(t)) continue;
        if (jdText.toLowerCase().includes(t)) continue;
        bad.push(h);
      }
      continue;
    }

    if (token.length > 3 && !jdText.toLowerCase().includes(token.toLowerCase())) {
      bad.push(token);
    }
  }
  return [...new Set(bad)];
}

/** Summary may mention JD themes; only block fabricated hard tools. */
export function unsupportedSummaryTools(
  originalText: string,
  jdText: string,
  summary: string,
): string[] {
  const origLower = originalText.toLowerCase();
  const jdLower = jdText.toLowerCase();
  const bad: string[] = [];
  for (const m of summary.match(HARD_TOOL) ?? []) {
    const t = m.toLowerCase();
    if (origLower.includes(t) || jdLower.includes(t)) continue;
    bad.push(m);
  }
  return [...new Set(bad)];
}

export function skillsSectionEnhanced(
  originalText: string,
  tailoredText: string,
  jdText: string,
): boolean {
  const origBlock = originalText.split('\n').filter((l) => isSkillCategoryLine(l));
  if (!origBlock.length) return false;

  let enhancedLines = 0;
  const tailBlock = tailoredText.split('\n').filter((l) => isSkillCategoryLine(l));

  for (const orig of origBlock) {
    const cat = skillCategoryName(orig)?.toLowerCase();
    if (!cat) continue;
    const tail = tailBlock.find((l) => skillCategoryName(l)?.toLowerCase() === cat);
    if (!tail || tail === orig) continue;
    const additions = newSkillTokens(orig, tail);
    if (additions.some((a) => isJdSupportedSkillPhrase(a, jdText, originalText))) enhancedLines++;
  }
  return enhancedLines >= 1;
}
