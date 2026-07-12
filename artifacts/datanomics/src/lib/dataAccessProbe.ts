import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

export interface DataAccessStatus {
  canReadCandidates: boolean;
  candidateCount: number;
  profileRole: UserRole | null;
  needsAdminPromotion: boolean;
  probeError?: string;
}

/** Probe whether RLS allows reading candidates (empty vs blocked). */
export async function probeDataAccess(userId: string, email: string): Promise<DataAccessStatus> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const profileRole = (profile?.role as UserRole | undefined) ?? null;

  const { data: rows, error } = await supabase.from('candidates').select('id').limit(5);

  const canReadCandidates = !error;
  const candidateCount = rows?.length ?? 0;

  const needsAdminPromotion =
    email.toLowerCase().includes('admin@') &&
    profileRole !== null &&
    profileRole !== 'admin' &&
    profileRole !== 'manager';

  return {
    canReadCandidates,
    candidateCount,
    profileRole,
    needsAdminPromotion,
    probeError: error?.message,
  };
}
