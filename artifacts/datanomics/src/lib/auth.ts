import { supabase } from './supabase';
import { withTimeout } from './fetchUtils';
import { formatNetworkError } from './supabaseHealth';
import type { Profile, UserRole } from '../types';

export async function signIn(email: string, password: string) {
  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      12_000,
      'Sign in',
    );
    if (error) throw error;
    // Fire-and-forget — don't block login on profile update errors
    supabase
      .from('profiles')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.user.id)
      .then(() => {});
    return data;
  } catch (err) {
    throw new Error(formatNetworkError(err));
  }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}

export async function getMyProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  return data as Profile | null;
}

export async function createUser(params: {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  phoneNumber?: string;
}) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: { data: { display_name: params.displayName, role: params.role } },
  });
  if (error) throw error;
  const uid = data.user!.id;
  // Upsert in case trigger already created the row
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: uid,
    email: params.email,
    display_name: params.displayName,
    role: params.role,
    phone_number: params.phoneNumber ?? null,
  }, { onConflict: 'id' });
  if (profileError) throw profileError;
  return uid;
}

export function onAuthChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
  return supabase.auth.onAuthStateChange(callback);
}
