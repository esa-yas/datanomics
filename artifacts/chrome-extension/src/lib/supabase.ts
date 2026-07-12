import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { extensionConfig } from './config';

const STORAGE_KEY = 'dn_extension_auth';

const chromeStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const data = await chrome.storage.local.get(key);
    return (data[key] as string) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await chrome.storage.local.set({ [key]: value });
  },
  removeItem: async (key: string): Promise<void> => {
    await chrome.storage.local.remove(key);
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(extensionConfig.supabaseUrl, extensionConfig.supabaseAnonKey, {
      auth: {
        storage: chromeStorageAdapter,
        storageKey: STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data } = await getSupabase().auth.getUser();
  return data.user;
}

export async function getProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await getSupabase()
    .from('profiles')
    .select('id, display_name, email, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface CandidatePick {
  id: string;
  full_name: string;
  email: string;
  target_roles: string[] | null;
  work_auth: string | null;
}

export async function fetchCandidates(): Promise<CandidatePick[]> {
  const { data, error } = await getSupabase()
    .from('candidates')
    .select('id, full_name, email, target_roles, work_auth')
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CandidatePick[];
}
