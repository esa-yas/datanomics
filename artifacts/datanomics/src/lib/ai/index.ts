const PROVIDER = import.meta.env.VITE_AI_PROVIDER ?? 'gemini';
const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY as string;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`;

async function gemini(prompt: string, system?: string): Promise<string> {
  if (!GEMINI_KEY) throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY.');
  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
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
  throw new Error('OpenAI integration is not yet active.');
}
async function claude(_prompt: string): Promise<string> {
  throw new Error('Anthropic Claude integration is not yet active.');
}

export async function callAI(prompt: string, system?: string): Promise<string> {
  switch (PROVIDER) {
    case 'openai':    return openai(prompt);
    case 'anthropic': return claude(prompt);
    default:          return gemini(prompt, system);
  }
}

const RESUME_TAILOR_SYSTEM = `You are an elite ATS resume optimization expert with 15 years of experience in data, analytics, and technology recruiting.

YOUR CARDINAL RULES — violate none of these:
1. PRESERVE STRUCTURE: Do not change section headings, their order, company names, job titles held, school names, degree names, date ranges, or the number of bullet points per role.
2. TEXT-ONLY EDITS: You may only modify: (a) the text inside bullet points, (b) the professional summary/objective paragraph, (c) the skills list entries.
3. NATURAL LANGUAGE: All edits must read as the candidate's own voice — professional, first-person implied, past-tense for past roles.
4. KEYWORD INTEGRATION: Weave missing keywords naturally into existing bullets by rephrasing. Never fabricate achievements or metrics.
5. TRUTHFULNESS: Never add a technology, tool, or skill the candidate did not already demonstrate elsewhere in the resume.
6. LENGTH PARITY: Each modified bullet should be approximately the same length as the original. Do not add new bullets.

Return ONLY valid JSON — no markdown fences, no commentary before or after.`;

export async function aiTailorResume(resumeText: string, jd: string, name: string) {
  const prompt = `Candidate: ${name}

=== ORIGINAL RESUME ===
${resumeText}

=== JOB DESCRIPTION ===
${jd}

Analyze the resume against the job description and produce a tailored version following your strict rules.

Return this exact JSON shape:
{
  "matchScoreBefore": <integer 0-100>,
  "matchScoreAfter": <integer 0-100>,
  "missingKeywords": ["keyword1", "keyword2"],
  "addedKeywords": ["keyword1", "keyword2"],
  "suggestedTitle": "exact job title from JD",
  "atsWarnings": ["warning description"],
  "optimizedSummary": "new summary paragraph only",
  "optimizedSkills": ["Skill1", "Skill2"],
  "sectionChanges": [
    { "label": "Professional Summary", "original": "old text", "tailored": "new text" },
    { "label": "Skills", "original": "old skills line", "tailored": "new skills line" },
    { "label": "Bullet: <Company> - <Role>", "original": "old bullet", "tailored": "new bullet" }
  ],
  "tailoredResumeText": "<full resume text with ONLY the above text modifications applied, structure identical>",
  "overallFeedback": "2-3 sentence coaching note for this candidate"
}`;

  const raw = await callAI(prompt, RESUME_TAILOR_SYSTEM);
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(cleaned);
}

export async function aiParseJD(jd: string) {
  const raw = await callAI(
    `Extract structured data from this job description. Return ONLY valid JSON:
{ "jobTitle": "", "company": "", "location": "", "workMode": "", "requiredSkills": [], "preferredSkills": [], "yearsOfExperience": 0, "workAuthorization": "", "salaryRange": "", "jobType": "", "keywords": [], "summary": "" }
JD: ${jd}`
  );
  return JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
}

export async function aiRecruiterReply(message: string, name: string, role: string, auth: string) {
  return callAI(
    `You are drafting a reply on behalf of ${name}, a ${role} candidate (${auth} work authorization).

Recruiter message: "${message}"

Write a reply that is:
- Professional and concise (under 100 words)
- Confirms interest and availability
- Ends with a specific next-step ask (schedule a call, request JD, ask about rate)
- Does NOT use buzzwords or excessive flattery

Reply only — no subject line, no salutation label:`,
    `You write professional email replies for job seekers. Your tone is confident, brief, and action-oriented.`
  );
}

export async function aiWeeklyNarrative(name: string, metrics: object, companies: string[]) {
  return callAI(
    `Write a weekly job search status report for ${name}.

Metrics this week: ${JSON.stringify(metrics)}
Top companies applied to: ${companies.join(', ') || 'none recorded'}

Format: 3 short paragraphs.
Para 1 (Accomplishments): What was done this week — applications, outreach, interviews.
Para 2 (Traction): Any positive signals — recruiter replies, interview requests, offers.
Para 3 (Next Week): Specific focus areas and goals for the coming week.

Tone: professional, factual, third-person. Under 180 words total.`,
    `You write concise weekly job search reports for a placement agency. Be specific, factual, and forward-looking.`
  );
}
