import type { Request, Response, NextFunction } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { gmailEnv } from '../lib/env';

export interface AuthedRequest extends Request {
  userId?: string;
  userRole?: string;
  userJwt?: string;
  userSupabase?: SupabaseClient;
}

const EMPLOYEE_ROLES = [
  'admin',
  'manager',
  'team_lead',
  'job_search_assistant',
  'resume_specialist',
  'email_specialist',
] as const;

export function createUserSupabase(jwt: string): SupabaseClient {
  const anonKey = gmailEnv.supabaseAnonKey;
  if (!anonKey) {
    throw new Error('SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY is required');
  }
  return createClient(gmailEnv.supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export async function requireStaffAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing authorization' });
      return;
    }
    const jwt = header.slice(7);
    const anonKey = gmailEnv.supabaseAnonKey;
    if (!anonKey) {
      res.status(500).json({ error: 'Server auth not configured (missing anon key)' });
      return;
    }

    const authClient = createClient(gmailEnv.supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await authClient.auth.getUser(jwt);
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const userSupabase = createUserSupabase(jwt);
    const { data: profile, error: profileError } = await userSupabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profileError) {
      res.status(500).json({ error: 'Could not load user profile' });
      return;
    }

    const role = profile?.role ?? '';
    if (!EMPLOYEE_ROLES.includes(role as (typeof EMPLOYEE_ROLES)[number])) {
      res.status(403).json({
        error: 'Staff access required',
        detail: profile ? `role "${role}" cannot manage Gmail sync` : 'no profile row for this user',
      });
      return;
    }

    req.userId = data.user.id;
    req.userRole = role;
    req.userJwt = jwt;
    req.userSupabase = userSupabase;
    next();
  } catch (err) {
    res.status(500).json({
      error: 'Auth check failed',
      detail: err instanceof Error ? err.message : undefined,
    });
  }
}
