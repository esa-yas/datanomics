export function computeQualityScore(checks: {
  quality_resume_tailored: boolean;
  quality_location_verified: boolean;
  quality_salary_verified: boolean;
  quality_auth_verified: boolean;
  quality_duplicate_checked: boolean;
  quality_notes_added: boolean;
}): number {
  const weights: Record<string, number> = {
    quality_resume_tailored: 30,
    quality_location_verified: 20,
    quality_salary_verified: 15,
    quality_auth_verified: 15,
    quality_duplicate_checked: 10,
    quality_notes_added: 10,
  };
  return Object.entries(weights).reduce(
    (score, [key, weight]) => score + ((checks as Record<string, boolean>)[key] ? weight : 0),
    0
  );
}
