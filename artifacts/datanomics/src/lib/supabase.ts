import { createClient } from '@supabase/supabase-js';
import { appConfig, isSupabaseConfigured } from './config';

if (!isSupabaseConfigured()) {
  console.warn(
    '[Datanomics] Supabase not configured. Copy .env.example → .env at the repo root and set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(
  appConfig.supabaseUrl ?? '',
  appConfig.supabaseAnonKey ?? '',
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  },
);

export { isSupabaseConfigured };
