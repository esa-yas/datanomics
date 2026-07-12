/** LinkedIn + Dice are treated as easy/quick applies; Other = direct/serious. */
export const EASY_APPLY_SHARE_THRESHOLD = 0.8;
export const MIN_APPLICATIONS_FOR_INSIGHT = 5;

export type ApplyMixTone = 'warning' | 'good' | 'neutral';

export interface ApplyMixInsight {
  tone: ApplyMixTone;
  title: string;
  detail: string;
  easyCount: number;
  directCount: number;
  total: number;
  easySharePct: number;
  directSharePct: number;
}

export function getApplyMixInsight(
  linkedin: number,
  dice: number,
  other: number,
): ApplyMixInsight | null {
  const easyCount = linkedin + dice;
  const directCount = other;
  const total = easyCount + directCount;

  if (total < MIN_APPLICATIONS_FOR_INSIGHT) return null;

  const easySharePct = Math.round((easyCount / total) * 100);
  const directSharePct = Math.round((directCount / total) * 100);

  if (easyCount / total >= EASY_APPLY_SHARE_THRESHOLD) {
    return {
      tone: 'warning',
      title: 'Mostly easy applies today',
      detail: `${easyCount} of ${total} applications (${easySharePct}%) are LinkedIn/Dice quick applies, with only ${directCount} direct application${directCount === 1 ? '' : 's'}. The applier may be prioritizing volume over company-site and recruiter outreach.`,
      easyCount,
      directCount,
      total,
      easySharePct,
      directSharePct,
    };
  }

  if (directCount > 0 && directSharePct >= 25) {
    return {
      tone: 'good',
      title: 'Healthy mix of easy and direct applies',
      detail: `${directCount} direct application${directCount === 1 ? '' : 's'} today alongside ${easyCount} LinkedIn/Dice applies (${easySharePct}% easy). This balance includes serious applications, not just one-click applies.`,
      easyCount,
      directCount,
      total,
      easySharePct,
      directSharePct,
    };
  }

  return {
    tone: 'neutral',
    title: 'Application mix today',
    detail: `${easyCount} easy applies and ${directCount} direct application${directCount === 1 ? '' : 's'} (${easySharePct}% easy).`,
    easyCount,
    directCount,
    total,
    easySharePct,
    directSharePct,
  };
}
