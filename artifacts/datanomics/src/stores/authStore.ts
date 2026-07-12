import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/fetchUtils';
import { formatNetworkError } from '../lib/supabaseHealth';
import type { Profile } from '../types';

const CACHE_KEY = 'dn_profile_v1';

let authListenerRegistered = false;
let profileFetchInFlight: Promise<Profile> | null = null;
/** The user id whose profile we've already started hydrating (avoids refetch on token refresh). */
let hydratedUserId: string | null = null;

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
  const now = new Date().toISOString();
  return {
    id: userId,
    email,
    display_name: email.split('@')[0],
    role: 'job_search_assistant',
    status: 'active',
    timezone: 'America/New_York',
    weekly_target_applications: 50,
    reply_sla_hours: 4,
    created_at: now,
    updated_at: now,
  };
}

async function fetchOrCreateProfile(userId: string, email: string): Promise<Profile> {
  if (profileFetchInFlight) return profileFetchInFlight;

  profileFetchInFlight = (async () => {
    const result = await withTimeout(
      Promise.resolve(supabase.from('profiles').select('*').eq('id', userId).maybeSingle()),
      10_000,
      'Profile load',
    );
    const { data, error } = result;

    if (data) {
      const profile = data as Profile;
      saveProfileCache(profile);
      return profile;
    }

    if (error) {
      console.warn('[auth] profile read failed:', error.message);
    }

    const row = {
      id: userId,
      email,
      display_name: email.split('@')[0],
      role: 'job_search_assistant' as const,
      status: 'active' as const,
      timezone: 'America/New_York',
      weekly_target_applications: 50,
      reply_sla_hours: 4,
    };

    const { data: upserted, error: upsertError } = await supabase
      .from('profiles')
      .upsert(row, { onConflict: 'id' })
      .select()
      .maybeSingle();

    if (upsertError) {
      console.warn('[auth] profile upsert failed:', upsertError.message);
    }

    const profile = (upserted as Profile | null) ?? buildFallbackProfile(userId, email);
    saveProfileCache(profile);
    return profile;
  })();

  try {
    return await profileFetchInFlight;
  } finally {
    profileFetchInFlight = null;
  }
}

type Setter = (partial: Partial<AuthState>) => void;
type Getter = () => AuthState;

/**
 * Fetch the fresh profile. MUST be called deferred (setTimeout / outside the
 * onAuthStateChange callback) — awaiting Supabase calls inside that callback can
 * deadlock the auth lock and stall future token refreshes.
 */
function hydrateProfile(set: Setter, get: Getter, session: Session) {
  const uid = session.user.id;
  fetchOrCreateProfile(uid, session.user.email ?? '')
    .then((profile) => {
      if (get().session?.user.id !== uid) return; // user changed mid-flight
      set({ user: profile, loading: false, initialized: true, initError: null });
    })
    .catch((err) => {
      if (get().session?.user.id !== uid) return;
      const cached = loadProfileCache();
      set({
        user: cached?.id === uid ? cached : buildFallbackProfile(uid, session.user.email ?? ''),
        loading: false,
        initialized: true,
        initError: formatNetworkError(err),
      });
    });
}

/**
 * Single source of truth for auth state. Applies the session synchronously (so
 * a valid persisted session is never dropped) and only refetches the profile
 * when the signed-in user actually changes.
 */
function handleSession(set: Setter, get: Getter, session: Session | null) {
  if (!session?.user) {
    clearProfileCache();
    hydratedUserId = null;
    set({ session: null, user: null, loading: false, initialized: true });
    return;
  }

  const uid = session.user.id;
  const cached = loadProfileCache();
  const current = get().user;
  const knownUser =
    current?.id === uid ? current : cached?.id === uid ? cached : null;

  set({
    session,
    user: knownUser,
    loading: !knownUser,
    initialized: true,
  });

  if (hydratedUserId !== uid) {
    hydratedUserId = uid;
    setTimeout(() => hydrateProfile(set, get, session), 0);
  } else if (knownUser) {
    set({ loading: false });
  }
}

function registerAuthListener(set: Setter, get: Getter) {
  if (authListenerRegistered) return;
  authListenerRegistered = true;

  // Fires INITIAL_SESSION on load (restores persisted session), plus SIGNED_IN,
  // TOKEN_REFRESHED, USER_UPDATED, SIGNED_OUT. Never await Supabase calls here.
  supabase.auth.onAuthStateChange((_event, session) => {
    handleSession(set, get, session);
  });
}

interface AuthState {
  user: Profile | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  initError: string | null;
  setUser: (user: Profile | null) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,
  initError: null,

  setUser: (user) => set({ user }),

  initialize: async () => {
    registerAuthListener(set, get);

    // Safety net in case INITIAL_SESSION is delayed. This NEVER clears an
    // existing session on error/timeout — a persisted login must survive a
    // slow network on refresh.
    try {
      const {
        data: { session },
      } = await withTimeout(supabase.auth.getSession(), 8_000, 'Session restore');

      if (!get().initialized) {
        handleSession(set, get, session);
      }
    } catch (err) {
      if (!get().initialized) {
        const cached = loadProfileCache();
        set({
          loading: false,
          initialized: true,
          initError: formatNetworkError(err),
          user: get().user ?? cached ?? null,
        });
      }
    }
  },

  signOut: async () => {
    clearProfileCache();
    hydratedUserId = null;
    set({ user: null, session: null, initialized: true, loading: false });
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('[auth] sign out failed:', err);
    }
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
