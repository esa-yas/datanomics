interface SupabaseError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const TABLE_NOT_FOUND_CODES = ['42P01', 'PGRST116', '42P17'];
const TABLE_NOT_FOUND_MESSAGES = [
  'relation',
  'does not exist',
  'undefined table',
];

export function isTableMissingError(err: unknown): boolean {
  const e = err as SupabaseError;
  if (!e) return false;
  if (e.code && TABLE_NOT_FOUND_CODES.includes(e.code)) return true;
  const msg = (e.message ?? '') + (e.details ?? '');
  return TABLE_NOT_FOUND_MESSAGES.some((s) => msg.toLowerCase().includes(s));
}

export function friendlyError(err: unknown): string {
  const e = err as SupabaseError;
  if (!e) return 'An unknown error occurred.';

  if (isTableMissingError(e)) {
    return 'Database tables are not set up yet. Run the setup SQL in your Supabase SQL Editor to create all tables.';
  }

  if (e.code === '42P17') {
    return 'Database policy error (infinite recursion). Run supabase/fix-rls-recursion.sql in the Supabase SQL Editor.';
  }

  if (e.code === '42703') {
    return `Database column mismatch: ${e.message ?? 'unknown column'}. Update the app or run the latest schema SQL in Supabase.`;
  }

  if (e.code === '23505') {
    return 'A record with this information already exists.';
  }

  if (e.code === '23503') {
    return 'Cannot complete — a referenced record does not exist.';
  }

  if (e.code === 'PGRST301') {
    return 'You are not authorized to perform this action.';
  }

  const msg = e.message || e.details || e.hint;
  if (msg) {
    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return 'Cannot reach Supabase — check VITE_SUPABASE_URL in .env matches your Supabase project (Dashboard → Settings → API).';
    }
    if (msg.includes('Failed to fetch') || msg.includes('fetch failed')) {
      return 'Network error connecting to Supabase. Check internet and your Supabase project URL.';
    }
    return msg;
  }

  return 'An unexpected error occurred. Check the browser console for details.';
}
