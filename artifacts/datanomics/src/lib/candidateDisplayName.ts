export type CandidateNameJoin =
  | { full_name?: string | null }
  | { full_name?: string | null }[]
  | null
  | undefined;

/** Read full_name from a Supabase candidates(...) embed (object or array). */
export function candidateNameFromJoin(join: CandidateNameJoin): string | undefined {
  if (!join) return undefined;
  if (Array.isArray(join)) {
    const name = join[0]?.full_name?.trim();
    return name || undefined;
  }
  const name = join.full_name?.trim();
  return name || undefined;
}

/** Resolve a display name from join data, optional id→name lookup, then fallback. */
export function resolveCandidateDisplayName(
  candidateId: string,
  join?: CandidateNameJoin,
  lookup?: ReadonlyMap<string, string>,
  fallback = 'Unknown',
): string {
  const fromJoin = candidateNameFromJoin(join);
  if (fromJoin) return fromJoin;

  const fromLookup = lookup?.get(candidateId)?.trim();
  if (fromLookup) return fromLookup;

  return fallback;
}
