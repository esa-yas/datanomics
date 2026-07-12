import { jobResearchEnv } from './env';

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  source: 'tavily' | 'serper';
}

const EASY_APPLY_DOMAINS = ['linkedin.com', 'dice.com', 'indeed.com', 'ziprecruiter.com', 'glassdoor.com'];

export function isEasyApplyUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return EASY_APPLY_DOMAINS.some((domain) => lower.includes(domain));
}

const JOB_TITLE_RE =
  /\b(engineer|developer|analyst|manager|architect|consultant|designer|scientist|administrator|specialist|lead|director|coordinator|associate|officer|programmer|devops|intelligence|financial|business|data|bi\b|power\s*bi|recruiter|accountant|auditor)\b/i;

const SENIORITY_RE = /^(senior|junior|lead|staff|principal|sr\.?|jr\.?)\s+/i;

/** Split compound headers (pipes, slashes) into individual job titles. */
export function normalizeTargetRoles(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const entry of raw) {
    const trimmed = entry?.trim();
    if (!trimmed) continue;

    const fragments = trimmed
      .split(/\s*\|\s*|\s*\/\s*/)
      .flatMap((part) => part.split(/,\s*(?=[A-Z])/))
      .map((s) => s.trim())
      .filter(Boolean);

    const candidates = fragments.length > 0 ? fragments : [trimmed];

    for (const fragment of candidates) {
      if (!isJobTitleLike(fragment)) continue;
      const key = fragment.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(fragment.replace(/\s+/g, ' '));
    }
  }

  return out.slice(0, 5);
}

export function isJobTitleLike(text: string): boolean {
  const cleaned = text.trim();
  if (cleaned.length < 8 || cleaned.length > 80) return false;
  if (/@|https?:\/\//i.test(cleaned)) return false;
  if (/^(remote|hybrid|onsite|united states|usa)$/i.test(cleaned)) return false;
  if (/^(languages?|programming|tools?|skills?)\s*:/i.test(cleaned)) return false;
  return JOB_TITLE_RE.test(cleaned);
}

/** True when a job posting title aligns with at least one configured target role. */
export function titleMatchesTargetRoles(jobTitle: string, roles: string[]): boolean {
  const title = jobTitle.toLowerCase().replace(SENIORITY_RE, '').trim();
  if (!title) return false;

  return roles.some((role) => {
    const normalizedRole = role.toLowerCase().replace(SENIORITY_RE, '').trim();
    if (!normalizedRole) return false;
    if (title.includes(normalizedRole) || normalizedRole.includes(title)) return true;

    const roleWords = normalizedRole
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/^(and|the|for|with)$/i.test(w));
    if (roleWords.length === 0) return false;

    const matched = roleWords.filter((w) => title.includes(w));
    const threshold = roleWords.length <= 2 ? roleWords.length : 2;
    return matched.length >= threshold;
  });
}

async function tavilySearch(query: string, maxResults: number): Promise<SearchHit[]> {
  const key = jobResearchEnv.tavilyApiKey;
  if (!key) return [];

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: 'advanced',
      max_results: maxResults,
      exclude_domains: EASY_APPLY_DOMAINS,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Tavily search failed: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string }[];
  };

  return (data.results ?? []).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
    source: 'tavily' as const,
  }));
}

async function serperSearch(query: string, maxResults: number): Promise<SearchHit[]> {
  const key = jobResearchEnv.serperApiKey;
  if (!key) return [];

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': key,
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Serper search failed: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    organic?: { title?: string; link?: string; snippet?: string }[];
  };

  return (data.organic ?? [])
    .filter((r) => {
      const link = (r.link ?? '').toLowerCase();
      return !EASY_APPLY_DOMAINS.some((d) => link.includes(d));
    })
    .map((r) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      snippet: r.snippet ?? '',
      source: 'serper' as const,
    }));
}

export async function webSearch(query: string, maxResults = 8): Promise<SearchHit[]> {
  if (jobResearchEnv.serperApiKey) {
    return serperSearch(query, maxResults);
  }
  if (jobResearchEnv.tavilyApiKey) {
    return tavilySearch(query, maxResults);
  }
  throw new Error(
    'No search API configured. Set TAVILY_API_KEY or SERPER_API_KEY in .env (see supabase/JOB_RESEARCH.md).',
  );
}

export function buildSearchQueries(profile: {
  target_roles: string[];
  city?: string | null;
  state?: string | null;
  preferred_work_modes: string[];
}): string[] {
  const roles = normalizeTargetRoles(profile.target_roles);
  if (roles.length === 0) {
    throw new Error(
      'No target job titles on this candidate. Add target roles on the candidate profile (comma-separated titles) before running job research.',
    );
  }

  const location = [profile.city, profile.state].filter(Boolean).join(', ') || 'United States';
  const remote = profile.preferred_work_modes.includes('remote') ? 'remote' : '';
  const queries: string[] = [];

  for (const [index, role] of roles.entries()) {
    const quoted = `"${role}"`;
    if (index === 0) {
      queries.push(
        `${quoted} ${remote} ${location} careers apply site:greenhouse.io OR site:lever.co OR site:jobs.ashbyhq.com`,
      );
      queries.push(`${quoted} ${location} job opening direct apply -linkedin -dice -indeed`);
    }
    queries.push(`${quoted} ${remote} hiring "apply now" -linkedin -dice -indeed`);
  }

  return queries.map((q) => q.replace(/\s+/g, ' ').trim()).slice(0, 8);
}
