import { appConfig, isSupabaseConfigured } from './config';

export interface SupabaseHealthResult {
  ok: boolean;
  error?: string;
}

function formatNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    const host = appConfig.supabaseUrl?.replace(/^https?:\/\//, '') ?? 'your Supabase host';
    return `Cannot reach Supabase at ${host}. The project URL may be wrong or the project was deleted. Open Supabase Dashboard → Project Settings → API and copy the correct Project URL into .env as VITE_SUPABASE_URL, then restart the dev server.`;
  }
  if (msg.includes('timed out') || msg.includes('Timeout')) {
    return 'Supabase connection timed out. Check your internet connection and try again.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
    return 'Network error — cannot reach Supabase. Check your connection and that VITE_SUPABASE_URL in .env is correct.';
  }
  return msg;
}

/** Quick health check — Supabase auth health requires the anon key. */
export async function probeSupabaseConnection(timeoutMs = 6_000): Promise<SupabaseHealthResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error: 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the repo root .env file.',
    };
  }

  const base = appConfig.supabaseUrl!.replace(/\/$/, '');
  const anonKey = appConfig.supabaseAnonKey!;
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    // 200 = healthy; any response means the host resolves (not a DNS failure)
    if (res.ok || res.status === 401) {
      if (res.ok) return { ok: true };
      return {
        ok: false,
        error: 'Supabase rejected the anon key (401). Check VITE_SUPABASE_ANON_KEY in .env matches Project Settings → API.',
      };
    }
    return { ok: false, error: `Supabase health check failed (${res.status}). Verify your project URL and anon key.` };
  } catch (err) {
    return { ok: false, error: formatNetworkError(err) };
  }
}

export { formatNetworkError };
