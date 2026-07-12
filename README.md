# Job Search OS (Datanomics)

Internal platform for running candidate job searches end-to-end: intake data, applications, resumes, recruiter messages, Gmail activity, AI job research, and voice mock interviews — with role-based access for staff and a client portal for candidates.

**Stack:** React (Vite) + Node API + Supabase (Postgres, auth, RLS). Single-service deploy supported (see [DEPLOY.md](./DEPLOY.md)).

---

## Who uses it

| Role | Main use |
|------|----------|
| **Admin / Manager** | Team, settings, all candidates, imports |
| **Job search assistant** | Apply to jobs, track applications, messages, assigned candidates only |
| **Resume / email specialist** | Tailor resumes, reply templates, recruiter threads |
| **Client (candidate)** | Portal view of their own progress |

---

## What’s live today

| Area | What it does |
|------|----------------|
| **Candidates** | Profiles, status pipeline, assignments, notes, follow-ups |
| **Profiles** | Bulk JSON intake upload → full detail view in Supabase + AI search |
| **Applications** | Track applies, status, quality checks, recruiter contact |
| **Resumes** | Upload, AI tailor to JD, DOCX export |
| **Messages** | Recruiter inbox + AI reply drafts (intent-based) |
| **Gmail sync** | OAuth connect; sync “Apply” label metadata into dashboard |
| **Job research** | Web search + AI ranking → recommended direct-apply roles |
| **Interview practice** | Shareable link; ElevenLabs voice mock interview + AI report |
| **Reports & templates** | Weekly narratives, reusable message templates |
| **Chrome extension** | Capture jobs from LinkedIn / Indeed / Gmail (helper) |

---

## Systems you need (to run the business)

| System | Required? | Business purpose |
|--------|-----------|------------------|
| **Supabase** | Yes | Database, login, security (RLS), all candidate data |
| **OpenAI (or proxy)** | Strongly recommended | Resume tailoring, recruiter replies, job ranking |
| **ElevenLabs** | For voice interviews | Mock interviews; needs quota + stable network at server boot |
| **Google Cloud (Gmail API)** | For apply tracking | Connect candidate Gmail; sync application label activity |
| **Serper or Tavily** | For job research | Find direct-apply postings (paid search API) |
| **Hosting** | Production | Railway, Render, Fly, Docker VPS, etc. ([DEPLOY.md](./DEPLOY.md)) |

Copy `.env.example` → `.env` and fill keys before `pnpm dev`.

---

## Quick start (dev)

```bash
cp .env.example .env   # fill Supabase + AI keys
pnpm install
pnpm dev                 # API :5001 + UI :5173
```

Apply Supabase migrations under `supabase/migrations/` (SQL editor or `supabase db push`).  
Feature-specific setup: [GMAIL_SYNC.md](./supabase/GMAIL_SYNC.md), [JOB_RESEARCH.md](./supabase/JOB_RESEARCH.md).

---

## What to add or improve (business priorities)

### Stabilize (do first)

1. **Secrets & env checklist** — One production `.env` with Supabase, OpenAI, ElevenLabs, Gmail OAuth, Serper/Tavily; document owners and renewal dates.
2. **Supabase migrations in CI** — Ensure `imported_profiles`, Gmail, job research, interview tables are applied on every environment.
3. **ElevenLabs reliability** — Monitor API quota; restart API after key rotation; set `ELEVENLABS_INTERVIEW_AGENT_ID` from server logs.
4. **Gmail reconnect flow** — Many candidates need re-OAuth when tokens expire (`invalid_grant`); surface a clear “Reconnect Gmail” banner.
5. **AI provider consistency** — Standardize on **OpenAI** for app AI; use Gemini only where required (e.g. ElevenLabs agent LLM, optional fallbacks).

### Grow placement outcomes

6. **Intake → candidate record** — Auto-create/update `candidates` rows from imported JSON (Profiles) instead of a separate dataset.
7. **Application automation** — Chrome extension + API to log applies in one click; reduce manual entry.
8. **Job research quality** — Paid Serper plan (free tier blocks many queries); tune target roles per candidate.
9. **Resume pipeline** — Version control per JD; track which resume was sent per application.
10. **Message SLA** — Dashboard alerts for unread recruiter replies past `reply_sla_hours`.

### Scale the operation

11. **Client portal** — Richer weekly reports, interview prep links, document upload.
12. **Billing / payments** — Track intake payment proof and agreement status from imported JSON.
13. **Analytics** — Funnel: intake → active search → interview → offer; per-assistant productivity.
14. **Audit & compliance** — Mask passwords in UI only; restrict credential fields by role; export logs for agreements.
15. **Multi-tenant or branches** — If Datanomics grows teams, partition data by manager/region.

### Nice-to-have

16. **Calendar** — Interview scheduling integrated with messages.
17. **ATS integrations** — Greenhouse/Lever webhooks instead of only Gmail metadata.
18. **Notifications** — Email/Slack when high-match jobs or recruiter replies arrive.

---

## Repo map

| Path | Purpose |
|------|---------|
| `artifacts/datanomics/` | React UI |
| `artifacts/api-server/` | API, Gmail, job research, interviews, AI proxy |
| `artifacts/chrome-extension/` | Browser capture for job boards |
| `supabase/migrations/` | Database schema + RLS |
| `scripts/dev.sh` / `start.sh` | Local dev and production run |
| `DEPLOY.md` | Hosting and env vars |

---

## Support docs

- **Deploy:** [DEPLOY.md](./DEPLOY.md)
- **Gmail:** [supabase/GMAIL_SYNC.md](./supabase/GMAIL_SYNC.md)
- **Job research:** [supabase/JOB_RESEARCH.md](./supabase/JOB_RESEARCH.md)

For technical troubleshooting (RLS, OAuth, voice 503), check api-server logs on startup — ElevenLabs and Gmail failures usually appear before the first user request.
