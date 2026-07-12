import { readRepoEnvValue } from '../loadEnv';

// Prefer the current `.env` value (mtime-cached) over the process's original
// environment, so key edits take effect without restarting the api-server.
function optional(name: string, fallback = ''): string {
  return (readRepoEnvValue(name) ?? process.env[name])?.trim() || fallback;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export type JobResearchAiProvider = 'openai' | 'gemini' | 'auto';

export const jobResearchEnv = {
  get tavilyApiKey() {
    return optional('TAVILY_API_KEY');
  },
  get serperApiKey() {
    return optional('SERPER_API_KEY');
  },
  get openaiApiKey() {
    return optional('OPENAI_API_KEY', optional('VITE_OPENAI_API_KEY'));
  },
  get openaiBaseUrl() {
    return optional('OPENAI_BASE_URL', 'https://api.freemodel.dev').replace(/\/$/, '');
  },
  get geminiApiKey() {
    return optional('GEMINI_API_KEY', optional('VITE_GEMINI_API_KEY'));
  },
  get geminiModel() {
    return optional(
      'JOB_RESEARCH_GEMINI_MODEL',
      optional('VITE_GEMINI_MODEL', 'gemini-2.0-flash'),
    );
  },
  get researchModel() {
    return optional('JOB_RESEARCH_MODEL', optional('VITE_OPENAI_MODEL', 'gpt-5.5'));
  },
  get aiProvider(): JobResearchAiProvider {
    const explicit = optional('JOB_RESEARCH_AI_PROVIDER').toLowerCase();
    if (explicit === 'openai' || explicit === 'gemini' || explicit === 'auto') {
      return explicit;
    }
    const appProvider = optional('VITE_AI_PROVIDER').toLowerCase();
    if (appProvider === 'gemini' && jobResearchEnv.geminiApiKey) return 'gemini';
    if (appProvider === 'openai' && jobResearchEnv.openaiApiKey) return 'openai';
    if (jobResearchEnv.geminiApiKey && !jobResearchEnv.openaiApiKey) return 'gemini';
    if (jobResearchEnv.openaiApiKey && !jobResearchEnv.geminiApiKey) return 'openai';
    return 'auto';
  },
  get maxResultsPerRun() {
    const n = Number(optional('JOB_RESEARCH_MAX_RESULTS', '30'));
    return Number.isFinite(n) ? Math.min(Math.max(n, 10), 50) : 30;
  },
  get autoResearchIntervalHours() {
    const n = Number(optional('JOB_RESEARCH_AUTO_INTERVAL_HOURS', '24'));
    return Number.isFinite(n) && n > 0 ? n : 24;
  },
  get cronSecret() {
    return optional('JOB_RESEARCH_CRON_SECRET');
  },
  get supabaseUrl() {
    const url = optional('SUPABASE_URL', optional('VITE_SUPABASE_URL'));
    if (!url) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL');
    return url;
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
};
