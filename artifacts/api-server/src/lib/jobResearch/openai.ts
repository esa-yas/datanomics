import { logger } from '../logger';
import { jobResearchEnv } from './env';

const OPENAI_MODEL_FALLBACKS = ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.3-codex'];
const GEMINI_MODEL_FALLBACKS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetrySeconds(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: string;
        details?: Array<{ '@type'?: string; retryDelay?: string }>;
      };
    };
    for (const detail of parsed.error?.details ?? []) {
      if (detail['@type']?.includes('RetryInfo') && detail.retryDelay) {
        const match = detail.retryDelay.match(/(\d+)/);
        if (match) return parseInt(match[1], 10);
      }
    }
    const message = parsed.error?.message ?? '';
    const retryMatch = message.match(/retry in ([\d.]+)s/i);
    if (retryMatch) return Math.ceil(parseFloat(retryMatch[1]));
  } catch {
    /* ignore */
  }
  return null;
}

function extractOpenAIChatText(data: Record<string, unknown>): string {
  const choices = data.choices;
  if (!Array.isArray(choices) || !choices[0]) return '';
  const message = (choices[0] as Record<string, unknown>).message as
    | Record<string, unknown>
    | undefined;
  return typeof message?.content === 'string' ? message.content : '';
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
        const text = (part as Record<string, unknown>).text;
        if (typeof text === 'string' && text.trim()) chunks.push(text);
      }
    }
    if (typeof row.text === 'string' && row.text.trim()) chunks.push(row.text);
  }
  return chunks.join('\n').trim();
}

function uniqueModels(primary: string, fallbacks: string[]): string[] {
  const seen = new Set<string>();
  const models: string[] = [];
  for (const model of [primary, ...fallbacks]) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    models.push(trimmed);
  }
  return models;
}

async function requestOpenAI(
  path: '/v1/chat/completions' | '/v1/responses',
  body: Record<string, unknown>,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const key = jobResearchEnv.openaiApiKey;
  if (!key) {
    return { ok: false, status: 503, body: 'OPENAI_API_KEY not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(`${jobResearchEnv.openaiBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: text };
    }

    const data = JSON.parse(text) as Record<string, unknown>;
    const content =
      path === '/v1/responses'
        ? extractOpenAIResponsesText(data)
        : extractOpenAIChatText(data);
    if (!content.trim()) {
      return { ok: false, status: 502, body: 'Empty model response' };
    }
    return { ok: true, text: content };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, status: 0, body: message };
  } finally {
    clearTimeout(timer);
  }
}

async function requestGemini(
  model: string,
  system: string,
  user: string,
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const key = jobResearchEnv.geminiApiKey;
  if (!key) {
    return { ok: false, status: 503, body: 'GEMINI_API_KEY not configured' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': key,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      },
    );

    const text = await res.text();
    if (!res.ok) {
      return { ok: false, status: res.status, body: text };
    }

    const data = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!content.trim()) {
      return { ok: false, status: 502, body: 'Empty Gemini response' };
    }
    return { ok: true, text: content };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error';
    return { ok: false, status: 0, body: message };
  } finally {
    clearTimeout(timer);
  }
}

async function chatWithOpenAI(system: string, user: string): Promise<string> {
  const models = uniqueModels(jobResearchEnv.researchModel, OPENAI_MODEL_FALLBACKS);
  let lastError = 'OpenAI request failed';

  for (const model of models) {
    const chatBody: Record<string, unknown> = {
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
      temperature: 0.25,
    };

    const responsesBody: Record<string, unknown> = {
      model,
      instructions: system,
      input: user,
      max_output_tokens: 4096,
      text: { format: { type: 'json_object' } },
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      let result = await requestOpenAI('/v1/responses', responsesBody);
      if (!result.ok && (result.status === 404 || result.status === 400)) {
        result = await requestOpenAI('/v1/chat/completions', chatBody);
      } else if (!result.ok && result.status >= 500) {
        result = await requestOpenAI('/v1/chat/completions', chatBody);
      }

      if (result.ok) return result.text;

      lastError = `OpenAI ${result.status}: ${result.body.slice(0, 200)}`;
      const hardUnavailable =
        result.status === 503 && /service unavailable/i.test(result.body);
      const billingBlocked =
        result.status === 401 && /insufficient balance/i.test(result.body);
      if (hardUnavailable || billingBlocked) break;

      if (result.status === 429 || result.status === 503 || result.status === 502) {
        const waitSec = parseRetrySeconds(result.body) ?? 5 + attempt * 8;
        logger.warn({ model, attempt, waitSec, status: result.status }, 'OpenAI ranking retry');
        if (attempt < 2) {
          await sleep(waitSec * 1000);
          continue;
        }
      }
      break;
    }
  }

  throw new Error(`AI ranking failed — ${lastError}`);
}

async function chatWithGemini(system: string, user: string): Promise<string> {
  const models = uniqueModels(jobResearchEnv.geminiModel, GEMINI_MODEL_FALLBACKS);
  let lastError = 'Gemini request failed';

  for (const model of models) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await requestGemini(model, system, user);
      if (result.ok) return result.text;

      lastError = `Gemini ${result.status}: ${result.body.slice(0, 200)}`;
      if (result.status === 404) break;

      const hardUnavailable =
        result.status === 503 && /unavailable/i.test(result.body);
      if (hardUnavailable && attempt >= 1) break;

      if (result.status === 429 || result.status === 503 || result.status === 502) {
        const waitSec = parseRetrySeconds(result.body) ?? 8 + attempt * 10;
        logger.warn({ model, attempt, waitSec, status: result.status }, 'Gemini ranking retry');
        if (attempt < 3) {
          await sleep(waitSec * 1000);
          continue;
        }
      }
      break;
    }
  }

  throw new Error(`AI ranking failed — ${lastError}`);
}

export async function chatJson<T>(system: string, user: string): Promise<T> {
  const provider = jobResearchEnv.aiProvider;
  const hasOpenAI = Boolean(jobResearchEnv.openaiApiKey);
  const hasGemini = Boolean(jobResearchEnv.geminiApiKey);

  if (!hasOpenAI && !hasGemini) {
    throw new Error(
      'OPENAI_API_KEY or GEMINI_API_KEY is required for job research ranking',
    );
  }

  const attempts: Array<'openai' | 'gemini'> =
    provider === 'gemini'
      ? hasGemini
        ? ['gemini']
        : ['openai']
      : provider === 'openai'
        ? hasOpenAI
          ? ['openai']
          : ['gemini']
        : hasOpenAI && hasGemini
          ? ['openai', 'gemini']
          : hasGemini
            ? ['gemini']
            : ['openai'];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const text =
        attempt === 'gemini'
          ? await chatWithGemini(system, user)
          : await chatWithOpenAI(system, user);
      return JSON.parse(text) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { provider: attempt, err: lastError.message },
        'Job research AI provider failed — trying fallback',
      );
    }
  }

  throw lastError ?? new Error('AI ranking failed');
}
