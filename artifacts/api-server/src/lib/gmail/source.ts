export type ApplySource = 'LinkedIn' | 'Dice' | 'Other';

const LINKEDIN_SENDER = 'jobs-noreply@linkedin.com';
const DICE_SENDER = 'applyonline@dice.com';

export function detectApplySource(fromEmail: string | null | undefined): ApplySource {
  const email = (fromEmail ?? '').trim().toLowerCase();
  if (!email) return 'Other';
  if (email === LINKEDIN_SENDER || email.endsWith('@linkedin.com') && email.includes('jobs-noreply')) {
    return 'LinkedIn';
  }
  if (email === DICE_SENDER || email.endsWith('@dice.com')) {
    return 'Dice';
  }
  return 'Other';
}

export function parseFromHeader(from: string | null | undefined): { email: string; name: string | null } {
  const raw = (from ?? '').trim();
  if (!raw) return { email: '', name: null };

  const angle = raw.match(/<([^>]+)>/);
  if (angle) {
    const email = angle[1].trim().toLowerCase();
    const name = raw.replace(angle[0], '').replace(/^["'\s]+|["'\s]+$/g, '').trim() || null;
    return { email, name };
  }
  return { email: raw.toLowerCase(), name: null };
}
