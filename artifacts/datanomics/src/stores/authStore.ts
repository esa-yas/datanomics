import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthState {
  user: Profile | null;
  session: unknown | null;
  loading: boolean;
  initialized: boolean;
  setUser: (user: Profile | null) => void;
  setSession: (session: unknown | null) => void;
  setLoading: (loading: boolean) => void;
  initialize: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),

  initialize: async () => {
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();
    set({ session });

    if (session?.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      set({ user: profile as Profile });
    }

    supabase.auth.onAuthStateChange(async (event, session) => {
      set({ session });
      if (session?.user) {
        set({ loading: true });
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        set({ user: profile as Profile, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    });

    set({ loading: false, initialized: true });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null });
  },
}));

export function useIsAdmin() {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'admin';
}

export function useIsManager() {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'admin' || user?.role === 'manager';
}

export function useIsEmployee() {
  const user = useAuthStore((s) => s.user);
  return user?.role !== 'client' && user?.role !== undefined;
}
