import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

function buildFallbackProfile(userId: string, email: string): Profile {
  return {
    id: userId,
    email,
    display_name: email.split('@')[0],
    role: 'job_search_assistant',
    status: 'active',
    timezone: 'America/New_York',
    weekly_target_applications: 50,
    reply_sla_hours: 4,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as Profile;
}

async function fetchOrCreateProfile(userId: string, email: string): Promise<Profile> {
  // Try to fetch existing profile
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (data) return data as Profile;

  // Profile doesn't exist (user created before trigger was fixed) — upsert it
  const fallback = {
    id: userId,
    email,
    display_name: email.split('@')[0],
    role: 'job_search_assistant',
    status: 'active',
    timezone: 'America/New_York',
    weekly_target_applications: 50,
    reply_sla_hours: 4,
  };

  const { data: upserted } = await supabase
    .from('profiles')
    .upsert(fallback, { onConflict: 'id' })
    .select()
    .single();

  return (upserted as Profile) ?? buildFallbackProfile(userId, email);
}

interface AuthState {
  user: Profile | null;
  session: unknown | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: Profile | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),

  initialize: async () => {
    set({ loading: true });

    // Check for an existing session on load
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? '');
      set({ session, user: profile, loading: false, initialized: true });
    } else {
      set({ session: null, user: null, loading: false, initialized: true });
    }

    // Listen for future auth changes (login / logout)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ loading: true });
        const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? '');
        set({ session, user: profile, loading: false });
      } else {
        set({ session: null, user: null, loading: false });
      }
    });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));

export function useIsAdmin() {
  return useAuthStore((s) => s.user?.role === 'admin');
}

export function useIsManager() {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'admin' || role === 'manager';
}

export function useIsEmployee() {
  const role = useAuthStore((s) => s.user?.role);
  return !!role && role !== 'client';
}
