import { describe, expect, it } from 'vitest';

// Mirror of api-server source detection (keep in sync)
type ApplySource = 'LinkedIn' | 'Dice' | 'Other';

function detectApplySource(fromEmail: string | null | undefined): ApplySource {
  const email = (fromEmail ?? '').trim().toLowerCase();
  if (!email) return 'Other';
  if (email === 'jobs-noreply@linkedin.com') return 'LinkedIn';
  if (email === 'applyonline@dice.com' || email.endsWith('@dice.com')) return 'Dice';
  return 'Other';
}

describe('Gmail Apply source detection', () => {
  it('classifies LinkedIn sender', () => {
    expect(detectApplySource('jobs-noreply@linkedin.com')).toBe('LinkedIn');
  });

  it('classifies Dice sender', () => {
    expect(detectApplySource('applyonline@dice.com')).toBe('Dice');
  });

  it('classifies other senders', () => {
    expect(detectApplySource('hr@company.com')).toBe('Other');
  });
});
