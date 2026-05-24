import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

const CACHE_KEY = 'dn_profile_v1';

function saveProfileCache(profile: Profile) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profile));
  } catch {}
}

function loadProfileCache(): Profile | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function clearProfileCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}
}

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
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (data) {
    saveProfileCache(data as Profile);
    return data as Profile;
  }

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

  const profile = (upserted as Profile) ?? buildFallbackProfile(userId, email);
  saveProfileCache(profile);
  return profile;
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
    // Step 1: Hydrate from cache instantly — zero network latency
    const cached = loadProfileCache();
    if (cached) {
      set({ user: cached, loading: false, initialized: true });
    }

    // Step 2: Validate session from Supabase in the background
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      // Refresh profile from DB (don't block if cache already showed it)
      const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? '');
      set({ session, user: profile, loading: false, initialized: true });
    } else {
      // No valid session — clear cache and show login
      clearProfileCache();
      set({ session: null, user: null, loading: false, initialized: true });
    }

    // Step 3: Listen for future auth changes (login / logout / token refresh)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const cached = loadProfileCache();
        // Use cache optimistically, refresh in background
        if (cached && cached.id === session.user.id) {
          set({ session, user: cached, loading: false });
        } else {
          set({ loading: true });
        }
        const profile = await fetchOrCreateProfile(session.user.id, session.user.email ?? '');
        set({ session, user: profile, loading: false });
      } else {
        clearProfileCache();
        set({ session: null, user: null, loading: false });
      }
    });
  },

  signOut: async () => {
    clearProfileCache();
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
