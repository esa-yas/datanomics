import { describe, expect, it } from 'vitest';
import { getApplyMixInsight } from '../applyMixInsight';

describe('getApplyMixInsight', () => {
  it('returns null when too few applications', () => {
    expect(getApplyMixInsight(3, 1, 0)).toBeNull();
  });

  it('warns when easy applies are 80%+ of total', () => {
    const insight = getApplyMixInsight(24, 8, 8);
    expect(insight?.tone).toBe('warning');
    expect(insight?.easySharePct).toBe(80);
  });

  it('praises a balanced mix like 30 easy + 15 direct', () => {
    const insight = getApplyMixInsight(20, 10, 15);
    expect(insight?.tone).toBe('good');
    expect(insight?.directCount).toBe(15);
    expect(insight?.easySharePct).toBe(67);
  });
});
