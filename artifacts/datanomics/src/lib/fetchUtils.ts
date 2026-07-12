import { supabase } from './supabase';

export function withTimeout<T>(promise: Promise<T>, ms = 15_000, label = 'Request'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s. Check your network and Supabase project.`));
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/** Wait until Supabase has restored the user session (needed for RLS). */
export async function waitForSupabaseSession(maxMs = 8_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error('Session not ready. Try signing out and back in.');
}

export async function runSupabaseQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  await waitForSupabaseSession();
  return withTimeout(fn(), 15_000, label);
}
