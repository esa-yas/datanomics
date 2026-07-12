import { isSupabaseConfigured } from '@/lib/config';
import { useAuthStore } from '@/stores/authStore';

/**
 * True when a Supabase auth session is available (JWT for RLS).
 * Derived from the auth store — the single source of truth that reliably
 * restores the persisted session on refresh — so data queries start the
 * moment the session is known.
 */
export function useDataReady(): boolean {
  const hasSession = useAuthStore((s) => !!s.session?.access_token);
  return isSupabaseConfigured() && hasSession;
}
