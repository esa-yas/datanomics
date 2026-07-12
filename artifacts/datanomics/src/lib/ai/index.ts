import {
  appConfig,
  getAIConfigError,
  isAIConfigured,
  isGeminiConfigured,
  isOpenAIConfigured,
  usesOpenAIProxy,
} from '../config';
import { finalizeTailorResult } from '../resume/tailorValidation';
import { parseResumeStructure, parseHeaderRegion, getSkillsSectionHeading } from '../resume/resumeStructure';
import { parseTailorResponse, type TailorResult } from '../utils/resumeTailor';
import type { ReplyIntent, RecruiterReplyContext, GeneratedReply, AllReplyTemplates } from './replyIntents';
import { REPLY_INTENT_OPTIONS, ALL_REPLY_INTENTS } from './replyIntents';
import { formatProfessionalReply, REPLY_FORMAT_INSTRUCTION } from './formatReply';
import { PLACEHOLDER_HINT } from './templatePlaceholders';

export type { ReplyIntent, RecruiterReplyContext, GeneratedReply, AllReplyTemplates };
export { REPLY_INTENT_OPTIONS, ALL_REPLY_INTENTS } from './replyIntents';

const DEFAULT_MODEL = 'gemini-flash-latest';

/** Only remap retired model ids — do not override gemini-flash-latest / gemini-3.5-flash. */
const MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-pro': DEFAULT_MODEL,
  'gemini-1.5-pro-latest': DEFAULT_MODEL,
  'gemini-1.5-flash': DEFAULT_MODEL,
  'gemini-1.5-flash-latest': DEFAULT_MODEL,
};

export type AIStatusCallback = (message: string) => void;
/** @deprecated Use AIStatusCallback */
export type GeminiStatusCallback = AIStatusCallback;

function resolveModel(): string {
  const configured = (import.meta.env.VITE_GEMINI_MODEL as string | undefined)?.trim();
  const raw = configured || appConfig.geminiModel || DEFAULT_MODEL;
  return MODEL_ALIASES[raw] ?? raw;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function geminiHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-goog-api-key': appConfig.geminiApiKey ?? '',
  };
}

function truncateForApi(text: string, maxChars: number, label: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Note: ${label} was shortened for API limits.]`;
}

function parseRetrySeconds(errorBody: string): number | null {
  try {
    const parsed = JSON.parse(errorBody) as {
      error?: {
        message?: string;
        details?: Array<{ '@type'?: string; retryDelay?: string }>;
      };
    };
    for (const d of parsed.error?.details ?? []) {
      if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
        const m = d.retryDelay.match(/(\d+)/);
        if (m) return parseInt(m[1], 10);
      }
    }
    const msg = parsed.error?.message ?? '';
    const retryMatch = msg.match(/retry in ([\d.]+)s/i);
    if (retryMatch) return Math.ceil(parseFloat(retryMatch[1]));
  } catch {
    /* ignore */
  }
  return null;
}

function formatQuotaError(errorBody: string): string {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } };
    const msg = parsed.error?.message ?? errorBody;
    if (msg.includes('limit: 0') || msg.includes('PerDay')) {
      return (
        'Gemini free daily quota is used up for this API key. ' +
        'Wait until tomorrow, create a new key at aistudio.google.com/apikey, or enable billing. ' +
        'See ai.google.dev/gemini-api/docs/rate-limits'
      );
    }
    if (msg.includes('429') || msg.includes('quota')) {
      const wait = parseRetrySeconds(errorBody);
      if (wait) {
        return `Gemini rate limit — wait about ${wait} seconds and try once (do not double-click Analyze).`;
      }
    }
  } catch {
    /* ignore */
  }
  return 'Gemini rate limit (429). Wait 60 seconds, then try again once.';
}

async function geminiRequest(
  model: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(geminiUrl(model), {
    method: 'POST',
    headers: geminiHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }

  const d = await res.json();
  const candidate = d.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text ?? '';
  const reason = candidate?.finishReason;

  if (reason === 'SAFETY') {
    throw new Error('Content was blocked by Gemini safety filters. Try a shorter job description.');
  }
  if (reason === 'MAX_TOKENS') {
    if (text.trim()) return { ok: true, text };
    throw new Error('Response was cut off (too long). Retrying with a smaller edit set…');
  }
  if (!text.trim()) {
    throw new Error('AI returned an empty response. Check your Gemini API key and try again.');
  }

  return { ok: true, text };
}

async function gemini(
  prompt: string,
  system?: string,
  options?: { json?: boolean; maxOutputTokens?: number; onStatus?: AIStatusCallback },
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error('Gemini API key not configured. Set VITE_GEMINI_API_KEY in the repo root .env file.');
  }

  const model = resolveModel();
  const generationConfig: Record<string, unknown> = {
    temperature: 0.25,
    maxOutputTokens: options?.maxOutputTokens ?? 4096,
  };
  if (options?.json) {
    generationConfig.responseMimeType = 'application/json';
  }

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const onStatus = options?.onStatus;
  let lastBody = '';

  const maxAttempts = 4;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      onStatus?.(`Retrying Gemini (attempt ${attempt + 1}/${maxAttempts})…`);
    }

    const result = await geminiRequest(model, body);
    if (result.ok) return result.text;

    lastBody = result.body;

    if (result.status === 404) {
      throw new Error(`Gemini model "${model}" not found. Set VITE_GEMINI_MODEL=gemini-2.0-flash-lite in .env`);
    }

    if (result.status === 429 || result.status === 503) {
      const waitSec = parseRetrySeconds(result.body) ?? 20 + attempt * 15;
      if (attempt < maxAttempts - 1) {
        onStatus?.(`Rate limited — waiting ${waitSec}s before retry…`);
        await sleep(waitSec * 1000);
        continue;
      }
      throw new Error(formatQuotaError(result.body));
    }

    throw new Error(`Gemini ${result.status}: ${result.body.slice(0, 300)}`);
  }

  throw new Error(formatQuotaError(lastBody));
}

function openaiResponsesUrl(): string {
  return `${appConfig.openaiBaseUrl}/v1/responses`;
}

function openaiChatUrl(): string {
  return `${appConfig.openaiBaseUrl}/v1/chat/completions`;
}

function openaiHeaders(): HeadersInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Same-origin proxy injects Authorization server-side — never send the key from the browser.
  if (!usesOpenAIProxy() && appConfig.openaiApiKey) {
    headers.Authorization = `Bearer ${appConfig.openaiApiKey}`;
  }
  return headers;
}

function extractOpenAIResponsesText(data: Record<string, unknown>): string {
  if (typeof data.output_text === 'string' && data.output_text.trim()) {
    return data.output_text;
  }
  const output = data.output;
  if (!Array.isArray(output)) return '';

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (row.type === 'message' && Array.isArray(row.content)) {
      for (const part of row.content) {
        if (!part || typeof part !== 'object') continue;
        const p = part as Record<string, unknown>;
        if (typeof p.text === 'string' && p.text.trim()) chunks.push(p.text);
      }
    }
    if (typeof row.text === 'string' && row.text.trim()) chunks.push(row.text);
  }
  return chunks.join('\n').trim();
}

function extractOpenAIChatText(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (!Array.isArray(choices) || !choices[0]) return '';
  const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
  return typeof msg?.content === 'string' ? msg.content : '';
}

async function openaiRequest(
  body: Record<string, unknown>,
  useResponsesApi: boolean,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const url = useResponsesApi ? openaiResponsesUrl() : openaiChatUrl();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: openaiHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return { ok: false, status: res.status, body: await res.text() };
    }

    const data = (await res.json()) as Record<string, unknown>;
    const text = useResponsesApi ? extractOpenAIResponsesText(data) : extractOpenAIChatText(data);
    if (!text.trim()) {
      return { ok: false, status: 502, body: 'Empty model response' };
    }
    return { ok: true, text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Network error';
    return { ok: false, status: 0, body: msg };
  }
}

function parseAiErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string; code?: string };
    };
    if (typeof parsed.error === 'string') return parsed.error;
    if (typeof parsed.error?.message === 'string') return parsed.error.message;
  } catch {
    /* ignore */
  }
  return body;
}

function formatOpenAIError(status: number, body: string): string {
  if (status === 0) {
    return (
      'AI request blocked or unreachable (often CORS). Set VITE_OPENAI_BASE_URL=/api/ai and ' +
      'OPENAI_API_KEY in .env, then restart the dev server.'
    );
  }
  const msg = parseAiErrorMessage(body);
  if (status === 401) {
    if (/insufficient balance/i.test(msg)) {
      return (
        'Freemodel has insufficient balance. Add credits at freemodel.dev, ' +
        'or set VITE_AI_PROVIDER=gemini in .env (with VITE_GEMINI_API_KEY), ' +
        'or use OPENAI_BASE_URL=https://api.openai.com with a standard OpenAI key.'
      );
    }
    return `AI API key rejected: ${msg.slice(0, 200)}`;
  }
  if (status === 429) return `AI rate limit — wait and try again. ${msg.slice(0, 120)}`;
  if (status === 502) {
    return 'AI proxy timed out (502). Ensure api-server is running on port 5001 and retry.';
  }
  if (status === 404) {
    return `Model "${appConfig.openaiModel}" not found at ${appConfig.openaiBaseUrl}. Check VITE_OPENAI_MODEL.`;
  }
  return `OpenAI ${status}: ${msg.slice(0, 300)}`;
}

function isRecoverableAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /insufficient balance/i.test(msg) ||
    /rate limit/i.test(msg) ||
    /quota/i.test(msg) ||
    /429/.test(msg)
  );
}

async function openai(
  prompt: string,
  system?: string,
  options?: {
    json?: boolean;
    maxOutputTokens?: number;
    onStatus?: AIStatusCallback;
    reasoningEffort?: string;
    /** Skip slow Responses API — use chat completions only (faster for short tasks). */
    fast?: boolean;
  },
): Promise<string> {
  if (!isOpenAIConfigured()) {
    throw new Error(getAIConfigError() ?? 'OpenAI not configured.');
  }

  const onStatus = options?.onStatus;
  const maxTokens = options?.maxOutputTokens ?? 4096;
  const model = appConfig.openaiModel;
  const effort = options?.reasoningEffort ?? appConfig.openaiReasoningEffort;

  const responsesBody: Record<string, unknown> = {
    model,
    input: prompt,
    max_output_tokens: maxTokens,
    reasoning: { effort },
  };
  if (system) responsesBody.instructions = system;
  if (options?.json) {
    responsesBody.text = { format: { type: 'json_object' } };
  }

  const chatBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature: 0.35,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
  };
  if (options?.json) {
    chatBody.response_format = { type: 'json_object' };
  }

  let lastBody = '';
  const maxAttempts = options?.fast ? 2 : 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      onStatus?.(`Retrying ${model} (attempt ${attempt + 1}/${maxAttempts})…`);
    }

    let result: { ok: true; text: string } | { ok: false; status: number; body: string };

    if (options?.fast) {
      result = await openaiRequest(chatBody, false);
    } else {
      result = await openaiRequest(responsesBody, true);
      if (!result.ok && (result.status === 404 || result.status === 400 || result.status === 502)) {
        onStatus?.('Responses API unavailable — trying chat completions…');
        result = await openaiRequest(chatBody, false);
      }
    }

    if (result.ok) return result.text;

    lastBody = result.body;
    if (result.status === 429 || result.status === 503 || result.status === 502) {
      const waitSec = options?.fast ? 5 + attempt * 5 : 20 + attempt * 15;
      if (attempt < maxAttempts - 1) {
        onStatus?.(`Rate limited — waiting ${waitSec}s…`);
        await sleep(waitSec * 1000);
        continue;
      }
    }
    throw new Error(formatOpenAIError(result.status, result.body));
  }

  throw new Error(formatOpenAIError(429, lastBody));
}

async function claude(_prompt: string): Promise<string> {
  throw new Error('Anthropic Claude integration is not yet active.');
}

/** Unified LLM call — routes to OpenAI (GPT 5.5) or Gemini based on VITE_AI_PROVIDER. */
async function chat(
  prompt: string,
  system?: string,
  options?: {
    json?: boolean;
    maxOutputTokens?: number;
    onStatus?: AIStatusCallback;
    reasoningEffort?: string;
    fast?: boolean;
  },
): Promise<string> {
  if (!isAIConfigured()) {
    throw new Error(getAIConfigError() ?? 'AI provider not configured.');
  }
  if (appConfig.aiProvider === 'openai') {
    try {
      return await openai(prompt, system, options);
    } catch (err) {
      if (isRecoverableAiError(err) && isGeminiConfigured()) {
        options?.onStatus?.('OpenAI unavailable — trying Gemini…');
        return gemini(prompt, system, options);
      }
      throw err;
    }
  }
  if (appConfig.aiProvider === 'anthropic') return claude(prompt);
  return gemini(prompt, system, options);
}

export async function callAI(prompt: string, system?: string): Promise<string> {
  return chat(prompt, system);
}

const RESUME_TAILOR_SYSTEM = `You are an expert resume editor. Goal: align an EXISTING resume to a job description — NOT rewrite it from scratch.

CORE RULE — Original Resume + JD Alignment = Improved Tailored Resume
The output must look like the SAME candidate's document: same structure, same employers, same dates, same section order, same skill category names, same bullet style.

STRUCTURE RULE — Every uploaded resume is different. Detect and preserve the source document's layout:
- Header: may be Name → Title → Contact OR Name → Contact → Title (or similar). Never reorder header lines or contact fields.
- Skills section heading may be "Technical Skills", "Core Data & Analytics Skills", "Core Competencies", etc. — never rename it or category labels inside it.
- Category lines use the resume's own labels (e.g. "Business Intelligence:", "Financial Analysis:") — append JD keywords after existing tools only.
- Tailoring applies to ANY candidate and ANY JD domain (finance, product, marketing, revenue, consulting, analytics).

CONTROLLED TAILORING PRIORITY (follow this order — do NOT stop after one bullet):
1. Professional Summary — REQUIRED strong rewrite (optimizedSummary): 3–5 sentences, naturally include 4–6 JD themes (e.g. revenue analytics, sales performance reporting, pipeline reporting, revenue forecasting, CRM/Salesforce analytics, executive KPI dashboards, reporting automation, marketing analytics, campaign performance, attribution models, funnel analysis, customer acquisition, marketing ROI, product analytics, retention, A/B testing). Must read noticeably different from the original while staying truthful.
2. Headline/title line — optional tweak (suggestedTitle): 1–3 role titles only, pipe-separated. Preserve the uploaded resume's header layout (Name → Title → Contact OR Name → Contact → Title). Only replace the title/role line — do not reorder contact fields or move lines.
3. Skills section — REQUIRED when the JD lists relevant themes: update multiple category lines (typically 2–5 depending on how many categories exist). Keep EVERY category name exactly and ALL original tools; append 2–4 supported JD phrases per updated line. Match JD domain to categories (finance JD → financial categories; product JD → analytics/BI categories; etc.). Use sectionChanges with the full "Category: tools…" line as original/tailored.
4. Most recent job — REQUIRED 2–3 bullet rewrites (sectionChanges)
5. Second job — 1–2 bullet rewrites
6. Older jobs — at most 1 bullet rewrite each
7. Education & Certifications — DO NOT EDIT unless explicitly broken

NEVER DO:
- Full resume rewrite or restructure sections
- Invent employers, job titles, dates, degrees, certifications, tools, clearance, or industries
- Replace skill category lines with job titles (WRONG: "Senior Product Data Analyst" as a skill line)
- Insert a job title or headline as an experience bullet (WRONG: "Analytics Engineer | Senior Data Analyst | Power BI Developer" as a bullet)
- Put pipe-joined role titles or the resume headline inside Professional Experience
- Remove strong bullets with metrics — improve them instead
- Edit company | location | date lines
- Edit section headers
- Use bullet characters (•, -, *) — Word handles bullets
- Add tools/skills not supported anywhere in the source resume

JD TITLE QUARANTINE: The target JD title (e.g. "Senior Salesforce Data Analyst") may ONLY shape the optimizedSummary wording and the optional suggestedTitle headline. NEVER place the JD title in Technical Skills, as an experience bullet, or as any standalone line.

BULLET STYLE: Every bullet must be a real responsibility/achievement: Action verb (Designed, Built, Developed, Configured, Automated, Implemented, Analyzed, Maintained, Optimized, Led…) + tool/skill + business context + result/impact. Keep similar length to original. A bullet is NEVER a job title, headline, or list of role titles, and never under 8 words.

sectionChanges rules:
- Min 5 items, max 10 total (include at least 3 Technical Skills category lines + 2+ experience bullets)
- Each "original" MUST be copied EXACTLY from the resume (one line, no line breaks)
- Each "tailored" is ONE improved line replacing only that line — still a full sentence describing real work, NOT a job title
- For skills: copy the entire "Category: tools…" line as original; tailored keeps the same category label and all original tools, plus appended JD phrases
- Map JD keywords to existing experience — do not force irrelevant keywords

JSON (valid only, no markdown):
- sectionChanges: [{label, original, tailored}]
- optimizedSummary: full rewritten summary paragraph (REQUIRED — must differ strongly from original)
- suggestedTitle: role titles only, 1–3 pipe-separated titles, NO location (optional)
- missingKeywords: JD terms NOT added because unsupported
- addedKeywords: JD terms successfully woven in
- matchScoreBefore, matchScoreAfter, atsWarnings, overallFeedback
- Do NOT return tailoredResumeText or optimizedSkills array`;

function buildStructureHint(resumeText: string): string {
  const s = parseResumeStructure(resumeText);
  const parts = [
    `Sections (preserve order): ${s.sectionHeadings.join(' → ') || 'standard'}`,
  ];

  const header = parseHeaderRegion(resumeText);
  if (header?.headlineIdx != null) {
    const layout = header.contactBeforeTitle ? 'Name → Contact → Title' : 'Name → Title → Contact';
    parts.push(`Header layout (preserve exactly — do not reorder): ${layout}`);
  }

  const skillsHeading = getSkillsSectionHeading(resumeText);
  if (skillsHeading) {
    parts.push(`Skills section heading (do not rename): ${skillsHeading}`);
  }
  if (s.skillCategories.length) {
    parts.push(`Skill categories (keep names exactly): ${s.skillCategories.join(', ')}`);
  }
  if (s.skillLines.length) {
    parts.push(
      `Skill lines (copy each original exactly in sectionChanges; append JD keywords after colon):\n${s.skillLines.slice(0, 10).join('\n')}`,
    );
  }
  if (s.experienceJobCount) {
    parts.push(`Experience entries: ${s.experienceJobCount} (do not add/remove)`);
  }
  return parts.join('\n');
}

export async function aiTailorResume(
  resumeText: string,
  jd: string,
  name: string,
  onStatus?: AIStatusCallback,
): Promise<TailorResult> {
  const resume = truncateForApi(resumeText, 6000, 'Resume');
  const jobDesc = truncateForApi(jd, 3500, 'Job description');
  const structureHint = buildStructureHint(resumeText);

  const prompt = `Candidate: ${name}

${structureHint}

RESUME:
${resume}

JOB DESCRIPTION:
${jobDesc}

Return JSON:
{
  "matchScoreBefore": 0,
  "matchScoreAfter": 0,
  "missingKeywords": [],
  "addedKeywords": [],
  "suggestedTitle": "",
  "atsWarnings": [],
  "optimizedSummary": "",
  "sectionChanges": [{"label":"","original":"","tailored":""}],
  "overallFeedback": ""
}`;

  const run = (compact: boolean) =>
    chat(
      compact
        ? `${prompt}\n\nIMPORTANT: Minimum 4 sectionChanges (skills + bullets). Copy originals exactly. Keep strings under 220 chars.`
        : prompt,
      RESUME_TAILOR_SYSTEM,
      {
        json: true,
        maxOutputTokens: 4096,
        onStatus,
        reasoningEffort: 'medium',
      },
    );

  let raw: string;
  try {
    raw = await run(false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('cut off') || msg.includes('MAX_TOKENS')) {
      onStatus?.('Response too long — retrying with fewer edits…');
      raw = await run(true);
    } else {
      throw err;
    }
  }

  onStatus?.('Validating structure and applying safe edits…');
  return finalizeTailorResult(resumeText, parseTailorResponse(raw), jd);
}

export async function aiParseJD(jd: string) {
  const raw = await chat(
    `Extract JSON: jobTitle, company, location, workMode, requiredSkills[], preferredSkills[], yearsOfExperience, workAuthorization, salaryRange, jobType, keywords[], summary. JD:\n${truncateForApi(jd, 6000, 'JD')}`,
    undefined,
    { json: true, maxOutputTokens: 2048 },
  );
  return JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
}

export async function aiRecruiterReply(message: string, name: string, role: string, auth: string) {
  const result = await aiRecruiterReplyAdvanced(
    {
      conversation: message,
      candidateName: name,
      targetRole: role,
      workAuth: auth,
      channel: 'email',
    },
    'interested',
  );
  return result.body;
}

const INTENT_GUIDANCE: Record<ReplyIntent, string> = {
  interested:
    'Show genuine interest. Confirm fit briefly. Propose a clear next step (call, interview, or resume).',
  not_interested: 'Decline clearly but professionally. Thank them. Keep it brief.',
  need_more_info: 'Ask 2–4 specific questions about role, team, location, comp, or process.',
  schedule_interview: 'Confirm interest and provide availability or ask for a scheduling link.',
  salary_rates: 'Answer compensation professionally — share a range or ask for their budget.',
  work_authorization: 'State work authorization clearly and positively.',
  follow_up: 'Politely follow up; reference the role/company; ask for an update.',
  polite_decline: 'Explain wrong fit (location, stack, level) but stay warm for future roles.',
  referral: 'Thank them; state current focus; ask about other matching roles.',
};

function channelGuidance(channel?: string): string {
  switch (channel) {
    case 'linkedin':
      return 'LinkedIn: concise (under 120 words), conversational. Use 1–2 short paragraphs with a blank line between.';
    case 'phone':
      return 'SMS/phone: very brief (under 60 words). One or two short lines max.';
    default:
      return 'Email: professional multi-paragraph format with blank lines between sections.';
  }
}

function truncateConversation(text: string, max = 3500): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(-max)}\n\n[Earlier messages truncated for length]`;
}

function parseReplyJson(raw: string): GeneratedReply {
  const parsed = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) as GeneratedReply;
  return parsed;
}

function buildCandidateBlock(ctx: RecruiterReplyContext): string {
  return `Candidate: ${ctx.candidateName}
Target role(s): ${ctx.targetRole || 'Not specified'}
Work authorization: ${ctx.workAuth || 'Not specified'}
Channel: ${ctx.channel ?? 'email'}
${ctx.subject ? `Subject: ${ctx.subject}` : ''}
${ctx.extraNotes ? `Staff notes: ${ctx.extraNotes}` : ''}`;
}

export async function aiRecruiterReplyAdvanced(
  ctx: RecruiterReplyContext,
  intent: ReplyIntent,
): Promise<GeneratedReply> {
  const intentMeta = REPLY_INTENT_OPTIONS.find((o) => o.value === intent);
  const system = `You write job-search replies on behalf of a candidate.
Tone: professional, warm, confident. Never fabricate experience or authorization.
${channelGuidance(ctx.channel)}
${REPLY_FORMAT_INSTRUCTION}
Return JSON only: { "subject": "optional email subject", "body": "reply with \\n\\n between paragraphs" }`;

  const prompt = `${buildCandidateBlock(ctx)}

Intent: ${intentMeta?.label ?? intent}
${INTENT_GUIDANCE[intent]}

Conversation:
---
${truncateConversation(ctx.conversation)}
---

Write as ${ctx.candidateName}. Reply to the latest inbound message; answer any questions asked.`;

  const raw = await chat(prompt, system, {
    json: true,
    maxOutputTokens: 800,
    fast: true,
    reasoningEffort: 'low',
  });
  const parsed = parseReplyJson(raw);
  return {
    subject: parsed.subject?.trim() || undefined,
    body: formatProfessionalReply((parsed.body ?? '').trim(), ctx.channel),
  };
}

export async function aiGenerateAllReplyTemplates(
  ctx: RecruiterReplyContext,
): Promise<{ replies: AllReplyTemplates; recommendedIntents: ReplyIntent[] }> {
  const intentList = ALL_REPLY_INTENTS.map(
    (id) => `${id}: ${REPLY_INTENT_OPTIONS.find((o) => o.value === id)?.label}`,
  ).join('\n');

  const system = `You write job-search reply templates for a candidate.
${channelGuidance(ctx.channel)}
${REPLY_FORMAT_INSTRUCTION}
Generate a distinct reply per intent. Pick 2–3 recommendedIntents for what they should send now.
Return JSON: { "recommendedIntents": [], "replies": { "interested": { "subject": "", "body": "" }, ... } }`;

  const prompt = `${buildCandidateBlock(ctx)}

Generate ALL intents:
${intentList}

Conversation:
---
${truncateConversation(ctx.conversation)}
---`;

  const raw = await chat(prompt, system, {
    json: true,
    maxOutputTokens: 3200,
    fast: true,
    reasoningEffort: 'low',
  });
  const parsed = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) as {
    replies?: AllReplyTemplates;
    recommendedIntents?: ReplyIntent[];
  };

  const replies: AllReplyTemplates = {};
  for (const intent of ALL_REPLY_INTENTS) {
    const entry = parsed.replies?.[intent];
    if (entry?.body?.trim()) {
      replies[intent] = {
        subject: entry.subject?.trim(),
        body: formatProfessionalReply(entry.body.trim(), ctx.channel),
      };
    }
  }

  const recommended = (parsed.recommendedIntents ?? []).filter((i) => ALL_REPLY_INTENTS.includes(i));
  return {
    replies,
    recommendedIntents: recommended.length ? recommended : ['interested', 'need_more_info'],
  };
}

/** Generate reusable templates with [Name], [Role], etc. — no conversation required. */
export async function aiGenerateMessageTemplateLibrary(channel = 'email'): Promise<AllReplyTemplates> {
  const intentList = ALL_REPLY_INTENTS.map(
    (id) => `${id}: ${REPLY_INTENT_OPTIONS.find((o) => o.value === id)?.label} — ${INTENT_GUIDANCE[id]}`,
  ).join('\n');

  const system = `You create reusable job-search MESSAGE TEMPLATES for a staffing team.
${PLACEHOLDER_HINT}
Do NOT reference a specific conversation, recruiter message, or real person/company.
Write generic professional templates the applicant fills in later.
${channelGuidance(channel)}
${REPLY_FORMAT_INSTRUCTION}
Sign-off must use [Name] (not a real name).
Return JSON only: { "replies": { "interested": { "subject": "Re: [Job Title] at [Company]", "body": "..." }, ... } }
Include every intent key listed below.`;

  const prompt = `Channel: ${channel}

Generate a complete template for EACH intent:
${intentList}`;

  const raw = await chat(prompt, system, {
    json: true,
    maxOutputTokens: 4000,
    fast: true,
    reasoningEffort: 'low',
  });

  const parsed = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) as {
    replies?: AllReplyTemplates;
  };

  const replies: AllReplyTemplates = {};
  for (const intent of ALL_REPLY_INTENTS) {
    const entry = parsed.replies?.[intent];
    if (entry?.body?.trim()) {
      replies[intent] = {
        subject: entry.subject?.trim(),
        body: formatProfessionalReply(entry.body.trim(), channel),
      };
    }
  }

  return replies;
}

export async function aiWeeklyNarrative(name: string, metrics: object, companies: string[]) {
  return chat(
    `Weekly report for ${name}. Metrics: ${JSON.stringify(metrics)}. Companies: ${companies.join(', ') || 'none'}. Three short paragraphs: accomplishments, traction, next week. Under 180 words.`,
    'Concise placement agency weekly reports.',
    { maxOutputTokens: 1024 },
  );
}
