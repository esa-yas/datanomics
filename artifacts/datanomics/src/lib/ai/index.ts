const PROVIDER = import.meta.env.VITE_AI_PROVIDER ?? 'gemini';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`;

async function gemini(prompt: string, system?: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY.');
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function openai(_prompt: string): Promise<string> {
  throw new Error('OpenAI integration is configured but not active.');
}

async function claude(_prompt: string): Promise<string> {
  throw new Error('Anthropic Claude integration is configured but not active.');
}

export async function callAI(prompt: string, system?: string): Promise<string> {
  switch (PROVIDER) {
    case 'openai':    return openai(prompt);
    case 'anthropic': return claude(prompt);
    default:          return gemini(prompt, system);
  }
}

export async function aiTailorResume(resumeText: string, jd: string, name: string) {
  const raw = await callAI(
    `You are an ATS expert for data roles. Return ONLY valid JSON, no markdown.
Candidate: ${name}
Resume: ${resumeText}
Job Description: ${jd}
Return: { matchScoreBefore, matchScoreAfter, missingKeywords, addedKeywords, suggestedTitle, optimizedSummary, optimizedSkills, optimizedBullets: { [role]: string[] }, atsWarnings, overallFeedback }`
  );
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

export async function aiParseJD(jd: string) {
  const raw = await callAI(
    `Extract from this job description. Return ONLY valid JSON:
{ jobTitle, company, location, workMode, requiredSkills, preferredSkills, yearsOfExperience, workAuthorization, salaryRange, jobType, keywords, summary }
JD: ${jd}`
  );
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

export async function aiRecruiterReply(message: string, name: string, role: string, auth: string) {
  return callAI(
    `Write a professional reply to this recruiter message.
Candidate: ${name} | Target Role: ${role} | Work Auth: ${auth}
Recruiter said: "${message}"
Reply only: professional, concise, end with a clear next-step ask.`
  );
}

export async function aiWeeklyNarrative(name: string, metrics: object, companies: string[]) {
  return callAI(
    `Write a 3-paragraph weekly job search report for ${name}.
Metrics: ${JSON.stringify(metrics)}. Top companies: ${companies.join(', ')}.
Para 1: accomplishments. Para 2: traction. Para 3: next week. Under 200 words.`
  );
}
