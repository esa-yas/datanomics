import {
  REPLY_INTENT_OPTIONS,
  type ReplyIntent,
  type RecruiterReplyContext,
  type GeneratedReply,
} from './replyIntents';
import { formatProfessionalReply, REPLY_FORMAT_INSTRUCTION } from './formatReply';

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

function openaiUpstream(): string {
  return (process.env.OPENAI_BASE_URL ?? 'https://api.freemodel.dev').replace(/\/$/, '');
}

function openaiApiKey(): string {
  return (process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY ?? '').trim();
}

function resolveModel(): string {
  return (
    process.env.VITE_OPENAI_MODEL ??
    process.env.OPENAI_MODEL ??
    'gpt-4o-mini'
  ).trim();
}

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

function buildCandidateBlock(ctx: RecruiterReplyContext): string {
  return `Candidate: ${ctx.candidateName}
Target role(s): ${ctx.targetRole || 'Not specified'}
Work authorization: ${ctx.workAuth || 'Not specified'}
Channel: ${ctx.channel ?? 'email'}
${ctx.subject ? `Subject: ${ctx.subject}` : ''}
${ctx.extraNotes ? `Staff notes: ${ctx.extraNotes}` : ''}`;
}

function parseReplyJson(raw: string): GeneratedReply {
  return JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()) as GeneratedReply;
}

async function chatJson(prompt: string, system: string): Promise<string> {
  const apiKey = openaiApiKey();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured on api-server');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);

  try {
    const res = await fetch(`${openaiUpstream()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolveModel(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 800,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const parsed = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = parsed.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateRecruiterReply(
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

  const raw = await chatJson(prompt, system);
  const parsed = parseReplyJson(raw);
  return {
    subject: parsed.subject?.trim() || undefined,
    body: formatProfessionalReply((parsed.body ?? '').trim(), ctx.channel),
  };
}
