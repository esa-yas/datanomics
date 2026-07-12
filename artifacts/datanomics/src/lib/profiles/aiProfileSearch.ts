import { callAI } from '@/lib/ai';
import { getAIConfigError, isAIConfigured } from '@/lib/config';
import { filterProfiles, type ImportedProfile } from './importedProfiles';

export interface AISearchResult {
  answer: string;
  matches: ImportedProfile[];
  usedAI: boolean;
}

function stripFences(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
}

/** One compact line per profile so the model can reason without huge token cost. */
function profileLine(p: ImportedProfile, index: number): string {
  const parts = [
    `#${index}`,
    p.name,
    p.jobTitles && `roles: ${p.jobTitles}`,
    p.location && `loc: ${p.location}`,
    p.workAuth && `auth: ${p.workAuth}`,
    p.jobMatch != null && `match: ${p.jobMatch}`,
    p.skills.length && `skills: ${p.skills.slice(0, 12).join(', ')}`,
  ].filter(Boolean);
  return parts.join(' | ');
}

/**
 * Natural-language search over imported profiles. Uses the configured LLM to pick
 * the most relevant profiles and write a short answer. Falls back to local keyword
 * search when AI is unavailable or errors, so the feature always returns results.
 */
export async function aiSearchProfiles(
  profiles: ImportedProfile[],
  query: string,
): Promise<AISearchResult> {
  const trimmed = query.trim();
  const localFallback = (): ImportedProfile[] => filterProfiles(profiles, trimmed, false);

  if (!trimmed) return { answer: '', matches: profiles, usedAI: false };

  if (!isAIConfigured() || profiles.length === 0) {
    return {
      answer: '',
      matches: localFallback(),
      usedAI: false,
    };
  }

  const catalog = profiles.map(profileLine).join('\n');
  const system =
    'You are a recruiting assistant searching a candidate database. ' +
    'Pick the profiles that best match the request and briefly explain why. ' +
    'Only use the provided profiles. Respond with strict JSON.';
  const prompt = `Candidate profiles:\n${catalog}\n\nRequest: "${trimmed}"\n\n` +
    'Return JSON: {"answer": "1-3 sentence summary of the best matches", "matches": [indexes]} ' +
    'where indexes are the # numbers of the most relevant profiles (max 10, best first). ' +
    'If nothing fits, return an empty matches array.';

  try {
    const raw = await callAI(prompt, system);
    const parsed = JSON.parse(stripFences(raw)) as { answer?: string; matches?: unknown };
    const idxList = Array.isArray(parsed.matches) ? parsed.matches : [];
    const matches: ImportedProfile[] = [];
    for (const idx of idxList) {
      const n = typeof idx === 'number' ? idx : Number(idx);
      if (Number.isInteger(n) && n >= 0 && n < profiles.length) matches.push(profiles[n]);
    }
    const unique = Array.from(new Set(matches));
    return {
      answer: (parsed.answer ?? '').trim(),
      matches: unique.length ? unique : localFallback(),
      usedAI: true,
    };
  } catch {
    return {
      answer: '',
      matches: localFallback(),
      usedAI: false,
    };
  }
}

/** Short AI briefing on a single profile ("basic knowledge" helper). */
export async function aiProfileInsight(profile: ImportedProfile): Promise<string> {
  if (!isAIConfigured()) {
    throw new Error(getAIConfigError() ?? 'AI provider not configured.');
  }

  const fd = profile.formData;
  const facts = [
    `Name: ${profile.name}`,
    profile.jobTitles && `Target roles: ${profile.jobTitles}`,
    profile.location && `Location: ${profile.location}`,
    profile.workAuth && `Work authorization: ${profile.workAuth}`,
    profile.skills.length && `Skills: ${profile.skills.join(', ')}`,
    fd.totalYearsExperience && `Experience: ${String(fd.totalYearsExperience)} years`,
    fd.currentJobTitle && `Current title: ${String(fd.currentJobTitle)}`,
    fd.professionalSummary && `Summary: ${String(fd.professionalSummary)}`,
  ]
    .filter(Boolean)
    .join('\n');

  const prompt = `Candidate:\n${facts}\n\nIn 3 short bullet points, give a recruiter a quick read: ` +
    '(1) headline strengths, (2) best-fit roles, (3) one thing to verify or watch. Keep it under 90 words.';

  return callAI(prompt, 'You are a concise recruiting analyst. Plain text, use "- " bullets.');
}
