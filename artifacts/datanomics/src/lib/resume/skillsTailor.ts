import { sanitizeBulletText } from '@/lib/resume/resumeLines';
import {
  findSkillsBlock,
  isSkillCategoryLine,
  skillCategoryName,
} from '@/lib/resume/resumeStructure';
import { extractJdSkillPhrases, isJdSupportedSkillPhrase } from '@/lib/resume/tailorDepth';
import type { ResumeSectionChange } from '@/lib/utils/resumeTailor';

const PHRASES_PER_LINE = 2;

/** How many category lines to enhance — scales with resume size, not a fixed count. */
export function targetSkillEnhancementCount(categoryCount: number, phraseCount: number): number {
  if (categoryCount <= 0) return 0;
  if (categoryCount === 1) return 1;
  if (categoryCount === 2) return 2;
  const byPhrases = Math.min(5, Math.max(2, Math.ceil(phraseCount / 2)));
  return Math.min(categoryCount, Math.max(2, Math.min(5, byPhrases)));
}

/** Score how well a JD phrase fits a skill category label. */
function categoryPhraseAffinity(categoryName: string, phrase: string): number {
  const cat = categoryName.toLowerCase();
  const p = phrase.toLowerCase();
  let score = 0;

  if (/financial|fp&a|accounting|finance|planning|budget|business analysis/.test(cat) && /fp&a|financial|budget|forecast|variance|reconcil|reporting workflow|month-end|close|variance analysis|forecasting/.test(p)) {
    score += 4;
  }
  if (/business intelligence|bi\b|dashboard|reporting|visualization|kpi/.test(cat) && /kpi|dashboard|report|automation|scenario|workflow|visualization|qa/.test(p)) {
    score += 4;
  }
  if (/data|analytics|sql|database|modeling|querying|core/.test(cat) && /data|analytics|reconcil|governance|model|sql|etl|pipeline|query/.test(p)) {
    score += 3;
  }
  if (/automation|etl|workflow/.test(cat) && /automation|workflow|etl|reporting|pipeline/.test(p)) {
    score += 4;
  }
  if (/quality|governance/.test(cat) && /governance|reconcil|quality|documentation|standards|qa/.test(p)) {
    score += 4;
  }
  if (/programming|tools|platform|technology|technical/.test(cat) && /automation|workflow|excel|power bi|tableau|sql|python/.test(p)) {
    score += 2;
  }
  if (cat.includes(p) || p.includes(cat.split(/\s+/)[0] ?? '')) score += 1;

  return score;
}

function pickPhrasesForCategory(categoryName: string, phrases: string[], max: number): string[] {
  return [...phrases]
    .sort((a, b) => categoryPhraseAffinity(categoryName, b) - categoryPhraseAffinity(categoryName, a))
    .filter((p, i, arr) => categoryPhraseAffinity(categoryName, p) > 0 || i === 0)
    .slice(0, max);
}

function skillLineTokens(line: string): Set<string> {
  const after = line.split(':').slice(1).join(':');
  return new Set(
    after
      .split(/[,|·•/]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

function phraseAlreadyPresent(line: string, phrase: string): boolean {
  const lower = line.toLowerCase();
  const p = phrase.toLowerCase();
  if (lower.includes(p)) return true;
  for (const token of skillLineTokens(line)) {
    if (token.includes(p) || p.includes(token)) return true;
  }
  return false;
}

/** Append supported JD phrases to a category line — keeps label and all original tokens. */
export function appendPhrasesToSkillLine(line: string, phrases: string[]): string {
  const cat = skillCategoryName(line);
  if (!cat || !phrases.length) return line;

  const after = line.split(':').slice(1).join(':').trim();
  if (!after) return line;

  const toAdd: string[] = [];
  for (const phrase of phrases) {
    const trimmed = sanitizeBulletText(phrase);
    if (!trimmed || phraseAlreadyPresent(line, trimmed)) continue;
    toAdd.push(trimmed);
  }
  if (!toAdd.length) return line;

  return `${cat}: ${after}, ${toAdd.join(', ')}`;
}

function currentSkillLineByCategory(text: string, categoryLower: string): string | null {
  const block = findSkillsBlock(text);
  if (!block) return null;
  for (const line of block.lines) {
    if (!isSkillCategoryLine(line)) continue;
    if (skillCategoryName(line)?.toLowerCase() === categoryLower) return line;
  }
  return null;
}

/** Count category lines with supported new JD phrases. */
export function countEnhancedSkillLines(
  originalText: string,
  tailoredText: string,
  jdText: string,
): number {
  const origBlock = findSkillsBlock(originalText);
  if (!origBlock) return 0;

  let count = 0;
  for (const orig of origBlock.lines.filter(isSkillCategoryLine)) {
    const cat = skillCategoryName(orig)?.toLowerCase();
    if (!cat) continue;
    const tail = currentSkillLineByCategory(tailoredText, cat);
    if (!tail || tail === orig) continue;
    const origTokens = skillLineTokens(orig);
    const newTokens = [...skillLineTokens(tail)].filter((t) => !origTokens.has(t));
    if (newTokens.some((t) => isJdSupportedSkillPhrase(t, jdText, originalText))) count++;
  }
  return count;
}

/**
 * Programmatically enhance 3–5 skill category lines when the JD requires it but AI under-delivered.
 * Preserves category names and all original skill tokens.
 */
export function buildSkillEnhancementChanges(
  originalText: string,
  tailoredText: string,
  jdText: string,
  existingChanges: ResumeSectionChange[] = [],
): ResumeSectionChange[] {
  const block = findSkillsBlock(originalText);
  if (!block) return [];

  const phrases = extractJdSkillPhrases(jdText);
  if (phrases.length < 2) return [];

  const origCategoryLines = block.lines.filter(isSkillCategoryLine);
  if (!origCategoryLines.length) return [];

  const alreadyChanged = new Set(
    existingChanges
      .filter((c) => isSkillCategoryLine(c.original))
      .map((c) => skillCategoryName(c.original)?.toLowerCase())
      .filter(Boolean) as string[],
  );

  const enhancedCount = countEnhancedSkillLines(originalText, tailoredText, jdText);
  const targetLines = targetSkillEnhancementCount(origCategoryLines.length, phrases.length);
  if (enhancedCount >= targetLines) return [];

  const assignments = new Map<string, string[]>();
  for (const phrase of phrases) {
    let bestCat: string | null = null;
    let bestScore = 0;
    for (const origLine of origCategoryLines) {
      const cat = skillCategoryName(origLine);
      if (!cat) continue;
      const score = categoryPhraseAffinity(cat, phrase);
      if (score > bestScore) {
        bestScore = score;
        bestCat = cat;
      }
    }
    if (!bestCat || bestScore === 0) {
      bestCat = skillCategoryName(origCategoryLines[0]!) ?? null;
    }
    if (!bestCat) continue;
    const key = bestCat.toLowerCase();
    if (!assignments.has(key)) assignments.set(key, []);
    assignments.get(key)!.push(phrase);
  }

  const changes: ResumeSectionChange[] = [];
  const categoriesEnhanced = new Set<string>(alreadyChanged);

  const sortedCats = [...assignments.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [catLower, catPhrases] of sortedCats) {
    if (categoriesEnhanced.size >= targetLines && !categoriesEnhanced.has(catLower)) continue;

    const origLine = origCategoryLines.find(
      (l) => skillCategoryName(l)?.toLowerCase() === catLower,
    );
    if (!origLine) continue;

    const baseLine = currentSkillLineByCategory(tailoredText, catLower) ?? origLine;
    const chunk = catPhrases.slice(0, PHRASES_PER_LINE + 1);
    const tailoredLine = appendPhrasesToSkillLine(baseLine, chunk);

    if (tailoredLine === origLine || tailoredLine === baseLine) continue;
    if (!isJdSupportedSkillPhrase(chunk[0] ?? '', jdText, originalText)) continue;

    changes.push({
      label: 'Technical Skills',
      original: origLine,
      tailored: tailoredLine,
    });
    categoriesEnhanced.add(catLower);
  }

  // Fill up to target with remaining categories using general phrases
  if (categoriesEnhanced.size < targetLines) {
    for (const origLine of origCategoryLines) {
      if (categoriesEnhanced.size >= targetLines) break;
      const cat = skillCategoryName(origLine)?.toLowerCase();
      if (!cat || categoriesEnhanced.has(cat)) continue;

      const baseLine = currentSkillLineByCategory(tailoredText, cat) ?? origLine;
      const extras = phrases
        .filter((p) => categoryPhraseAffinity(skillCategoryName(origLine) ?? '', p) >= 1)
        .slice(0, PHRASES_PER_LINE);
      const tailoredLine = appendPhrasesToSkillLine(baseLine, extras.length ? extras : phrases.slice(0, 2));
      if (tailoredLine === origLine || tailoredLine === baseLine) continue;

      changes.push({
        label: 'Technical Skills',
        original: origLine,
        tailored: tailoredLine,
      });
      categoriesEnhanced.add(cat);
    }
  }

  return changes;
}

/**
 * Directly enhance skill category lines in plain text (bypasses sectionChanges).
 * Preserves category names and all original tokens.
 */
export function enhanceSkillsInPlainText(
  originalText: string,
  text: string,
  jdText: string,
): string {
  const block = findSkillsBlock(originalText);
  if (!block) return text;

  const phrases = extractJdSkillPhrases(jdText);
  if (phrases.length < 2) return text;

  const origCategoryLines = block.lines.filter(isSkillCategoryLine);
  if (!origCategoryLines.length) return text;

  const targetLines = targetSkillEnhancementCount(origCategoryLines.length, phrases.length);
  const currentEnhanced = countEnhancedSkillLines(originalText, text, jdText);
  if (currentEnhanced >= targetLines) return text;

  let out = text;
  let enhanced = currentEnhanced;
  const sorted = [...origCategoryLines].sort(
    (a, b) =>
      pickPhrasesForCategory(skillCategoryName(b) ?? '', phrases, 1).length -
      pickPhrasesForCategory(skillCategoryName(a) ?? '', phrases, 1).length,
  );

  for (const origLine of sorted) {
    if (enhanced >= targetLines) break;
    const cat = skillCategoryName(origLine);
    if (!cat) continue;

    const catLower = cat.toLowerCase();
    const baseLine = currentSkillLineByCategory(out, catLower) ?? origLine;
    const chunk = pickPhrasesForCategory(cat, phrases, PHRASES_PER_LINE + 1);
    const tailoredLine = appendPhrasesToSkillLine(baseLine, chunk.length ? chunk : phrases.slice(0, 2));

    if (tailoredLine === origLine || tailoredLine === baseLine) continue;
    if (!isJdSupportedSkillPhrase(chunk[0] ?? phrases[0] ?? '', jdText, originalText)) continue;

    if (out.includes(baseLine)) {
      out = out.replace(baseLine, tailoredLine);
      enhanced++;
    }
  }

  return out;
}

/** Apply skill enhancement changes directly to plain text. */
export function applySkillEnhancementsToText(
  text: string,
  changes: ResumeSectionChange[],
): string {
  let out = text;
  for (const change of changes) {
    if (!isSkillCategoryLine(change.original)) continue;
    if (out.includes(change.original)) {
      out = out.replace(change.original, change.tailored);
    }
  }
  return out;
}
