const PLACEHOLDER_MARKERS = [
  'YOUR_PROJECT_REF',
  'your-supabase-anon-key',
  'your-gemini-api-key',
  'your-openai-api-key',
  'YOUR_API_KEY',
  'placeholder.supabase.co',
] as const;

function isPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((m) => lower.includes(m.toLowerCase()));
}

export type AIProvider = 'openai' | 'gemini' | 'anthropic';

function resolveAiProvider(): AIProvider {
  const raw = (import.meta.env.VITE_AI_PROVIDER as string | undefined)?.trim().toLowerCase();
  if (raw === 'gemini' || raw === 'anthropic' || raw === 'openai') return raw;
  return 'openai';
}

export const appConfig = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  aiProvider: resolveAiProvider(),
  openaiApiKey: import.meta.env.VITE_OPENAI_API_KEY as string | undefined,
  /** Freemodel proxy (Codex-compatible) or https://api.openai.com */
  /** Relative `/api/ai` uses the Vite dev proxy / api-server (avoids browser CORS). */
  openaiBaseUrl: (
    (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined) ?? '/api/ai'
  ).replace(/\/$/, ''),
  openaiModel: (
    (import.meta.env.VITE_OPENAI_MODEL as string | undefined) ?? 'gpt-5.5'
  ).trim(),
  openaiReasoningEffort: (
    (import.meta.env.VITE_OPENAI_REASONING_EFFORT as string | undefined) ?? 'medium'
  ).trim(),
  geminiApiKey: import.meta.env.VITE_GEMINI_API_KEY as string | undefined,
  /** Google AI model id — see https://ai.google.dev/gemini-api/docs/models */
  geminiModel: normalizeGeminiModel(
    (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? 'gemini-flash-latest',
  ),
} as const;

function normalizeGeminiModel(model: string): string {
  const aliases: Record<string, string> = {
    'gemini-1.5-pro': 'gemini-flash-latest',
    'gemini-1.5-pro-latest': 'gemini-flash-latest',
    'gemini-1.5-flash': 'gemini-flash-latest',
    'gemini-1.5-flash-latest': 'gemini-flash-latest',
  };
  return aliases[model.trim()] ?? model.trim();
}

export function isSupabaseConfigured(): boolean {
  return !isPlaceholder(appConfig.supabaseUrl) && !isPlaceholder(appConfig.supabaseAnonKey);
}

/** True when AI calls go through same-origin proxy (key stays on server). */
export function usesOpenAIProxy(): boolean {
  return appConfig.openaiBaseUrl.startsWith('/');
}

export function isOpenAIConfigured(): boolean {
  if (appConfig.aiProvider !== 'openai') return false;
  if (usesOpenAIProxy()) return true;
  return !isPlaceholder(appConfig.openaiApiKey);
}

export function isGeminiConfigured(): boolean {
  return appConfig.aiProvider === 'gemini' && !isPlaceholder(appConfig.geminiApiKey);
}

export function isAIConfigured(): boolean {
  if (appConfig.aiProvider === 'openai') return isOpenAIConfigured();
  if (appConfig.aiProvider === 'gemini') return isGeminiConfigured();
  return false;
}

export function getSupabaseConfigError(): string | null {
  if (isSupabaseConfigured()) return null;
  return 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repo root .env file.';
}

export function getAIConfigError(): string | null {
  if (isAIConfigured()) return null;
  if (appConfig.aiProvider === 'openai') {
    return 'OpenAI not configured. Set OPENAI_API_KEY in the repo root .env file (see .env.example).';
  }
  if (appConfig.aiProvider === 'gemini') {
    return 'Gemini API key not configured. Set VITE_GEMINI_API_KEY in the repo root .env file.';
  }
  return 'AI provider not configured.';
}
