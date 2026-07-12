import { interviewPracticeEnv } from './env';
import type { TranscriptMessage } from '@elevenlabs/elevenlabs-js/wrapper/speech-engine/types';

const MODEL_FALLBACKS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash-lite'];

function models(): string[] {
  const primary = interviewPracticeEnv.geminiFeedbackModel;
  const seen = new Set<string>();
  return [primary, ...MODEL_FALLBACKS].filter((m) => {
    if (seen.has(m)) return false;
    seen.add(m);
    return true;
  });
}

function toGeminiContents(transcript: TranscriptMessage[]) {
  return transcript.map((t) => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.content }],
  }));
}

function parseSseChunk(line: string): string {
  if (!line.startsWith('data: ')) return '';
  const payload = line.slice(6).trim();
  if (!payload || payload === '[DONE]') return '';
  try {
    const data = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  } catch {
    return '';
  }
}

export async function* streamInterviewerResponse(
  systemPrompt: string,
  transcript: TranscriptMessage[],
  signal: AbortSignal,
): AsyncGenerator<string> {
  const key = interviewPracticeEnv.geminiApiKey;
  if (!key) throw new Error('GEMINI_API_KEY not configured for interviewer LLM');

  const contents = toGeminiContents(transcript);
  let lastError = 'LLM request failed';

  for (const model of models()) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-goog-api-key': key,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: {
              temperature: 0.65,
              maxOutputTokens: 600,
            },
          }),
          signal,
        },
      );

      if (!res.ok) {
        lastError = await res.text();
        if (res.status === 429 || res.status === 503) continue;
        throw new Error(lastError.slice(0, 200));
      }

      if (!res.body) throw new Error('Empty LLM stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (signal.aborted) return;
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const text = parseSseChunk(line.trim());
          if (text) yield text;
        }
      }

      return;
    } catch (err) {
      if (signal.aborted) return;
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError);
}

export async function generateOpeningLine(
  systemPrompt: string,
  signal: AbortSignal,
): Promise<string> {
  let text = '';
  for await (const chunk of streamInterviewerResponse(
    systemPrompt,
    [{ role: 'user', content: 'Begin the interview now with your opening greeting and first question.' }],
    signal,
  )) {
    text += chunk;
  }
  return text.trim() || 'Hello, thanks for joining today. When you are ready, tell me about your background for this role.';
}
