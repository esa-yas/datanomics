# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

1. `cp .env.example .env` and fill in Supabase + optional OpenAI (GPT 5.5) keys
2. `pnpm install`
3. `pnpm --filter @workspace/datanomics run dev` — Job Search OS UI (default port **5173**)
4. `pnpm --filter @workspace/api-server run dev` — API scaffold (optional; health only)

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

### Environment (repo root `.env`)

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon key (client) |
| `OPENAI_API_KEY` | For AI features | Server-side key for GPT 5.5 (Freemodel or OpenAI) — not sent to browser |
| `OPENAI_BASE_URL` | No (default freemodel) | Upstream: `https://api.freemodel.dev` |
| `VITE_OPENAI_BASE_URL` | No (default `/api/ai`) | Same-origin proxy path (avoids CORS) |
| `VITE_OPENAI_MODEL` | No (default gpt-5.5) | Model id |
| `VITE_AI_PROVIDER` | No (default openai) | `openai` or `gemini` |
| `VITE_GEMINI_API_KEY` | If using Gemini | Alternative AI provider |
| `PORT` | No (default 5173) | Vite dev server |
| `BASE_PATH` | No (default `/`) | App base path |
| `DATABASE_URL` | For api-server / Drizzle | Postgres connection string |

### Supabase troubleshooting

- **400 / column does not exist** — app `select()` must match your schema (e.g. `recruiter_messages` has no `candidate_name`).
- **500 / infinite recursion on `profiles`** — run `supabase/fix-rls-recursion.sql` in the Supabase SQL Editor, then hard-refresh the app.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
