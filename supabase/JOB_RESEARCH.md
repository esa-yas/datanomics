# AI Job Research

Automated web search that finds **direct-apply** job postings for each candidate, ranks them with AI, and stores recommendations in Supabase.

## Setup

1. **Run migration** in Supabase SQL editor (or `supabase db push`):
   - `supabase/migrations/20250616120000_job_research.sql`

2. **Search API** (one required):
   - [Serper](https://serper.dev) — `SERPER_API_KEY=...` (preferred when both are set)
   - [Tavily](https://tavily.com) — `TAVILY_API_KEY=tvly-...`

   Put the key on its own line (no inline `#` comments after the value — the loader strips them, but restart the api-server after changing `.env`).

3. **AI ranking** (required):
   - `OPENAI_API_KEY` (same as resume tailor)

4. **Optional**
   - `JOB_RESEARCH_MAX_RESULTS=30` (10–50)
   - `JOB_RESEARCH_AUTO_INTERVAL_HOURS=24`
   - `JOB_RESEARCH_CRON_SECRET` for external cron

5. Restart api-server after env changes.

## How it works

1. Builds search queries from the candidate's **target roles** only (comma-separated job titles on the profile — not skills or resume text).
2. Calls Tavily/Serper — excludes LinkedIn, Dice, Indeed aggregators when possible.
3. OpenAI ranks hits but only keeps jobs whose title matches a target role.
4. Upserts into `job_recommendations` (deduped by URL per candidate).

## Daily auto-search

The api-server scheduler runs every `JOB_RESEARCH_AUTO_INTERVAL_HOURS` (default 24h) for candidates where:

- `job_research_enabled = true`
- Status is `lead`, `profile_setup`, `application_started`, or `active_search`
- `last_job_research_at` is older than the interval

Toggle per candidate on the **Job research** tab.

## API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/job-research/run` | Staff JWT | Start async search `{ candidateId }` → `{ runId }` |
| `GET /api/job-research/status/:runId` | Staff JWT | Poll run status |
| `POST /api/job-research/run-all` | `x-cron-secret` | Batch all due candidates |
| `PATCH /api/job-research/candidates/:id/enabled` | Staff JWT | `{ enabled: true/false }` |

## UI

- **Candidates → Job research tab** — run search, daily toggle, recommendations list
- **Job research** (sidebar) — all recommendations across candidates

## RLS

Uses `can_access_candidate_gmail()` — same access as Gmail sync (assigned staff + managers/admins).
