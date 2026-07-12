import type { CandidateStatus } from '@/types';

/** Placed candidates should not receive AI job search (manual or daily). */
export function isJobResearchEligible(status: CandidateStatus | string | undefined): boolean {
  return status !== 'placed';
}
