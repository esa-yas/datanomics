import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gmailEnv } from './env';

let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(gmailEnv.supabaseUrl, gmailEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
