# Deploy Job Search OS

The app runs as **one service**: a single Node process serves both the API and
the frontend (including the `/interview/:token` voice UI). No tunnel is needed —
the ElevenLabs voice agent is hosted by ElevenLabs and reached from the browser
over WebRTC.

## Run locally (one terminal)

```bash
pnpm install
pnpm dev          # api-server on :5001 + Vite on :5173 (Ctrl-C stops both)
```

Open http://localhost:5173. Interview links look like
`http://localhost:5173/interview/<token>`.

## Run production build locally (single service)

```bash
pnpm build:app    # builds frontend + api-server
PORT=8080 pnpm start
```

Everything (UI + API + interviews) is served from `http://localhost:8080`.

## Deploy with Docker (works on Railway, Render, Fly.io, Cloud Run, a VPS…)

```bash
docker build -t job-search-os .
docker run -p 8080:8080 --env-file .env -e PORT=8080 job-search-os
```

## Deploy without Docker (Node host)

Set the build command and start command:

- Build: `pnpm install && pnpm build:app`
- Start: `pnpm start`
- The platform provides `PORT`; the app binds to it automatically.

### Render.com (Node web service)

| Field | Value |
|-------|--------|
| Build Command | `pnpm install && pnpm build:app` |
| Start Command | `pnpm start` |
| Health Check | `/api/healthz` (optional) |

**Do not** run `corepack enable` on Render — the filesystem is read-only and the build
will fail with `EROFS: read-only file system, unlink '/usr/bin/pnpm'`.

Render detects `pnpm-lock.yaml` and provides `pnpm` automatically. If the build
still cannot find pnpm, use:

`npm install -g pnpm && pnpm install && pnpm build:app`

Set all `VITE_*` environment variables in the Render dashboard **before** the first
build (they are baked into the frontend at build time).

## Required environment variables

| Variable | Purpose |
|----------|---------|
| `PORT` | Port to listen on (set by most hosts). |
| `VITE_SUPABASE_URL` | Supabase project URL (build-time + runtime). |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (client). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server key for interview sessions/transcripts. |
| `ELEVENLABS_API_KEY` | Voice interview agent (ElevenLabs). |
| `ELEVENLABS_INTERVIEW_AGENT_ID` | Optional — auto-created on boot if missing (id is logged; save it). |
| `ELEVENLABS_AGENT_LLM` | Optional — hosted agent LLM (default `gemini-2.0-flash`). |
| `VITE_GEMINI_API_KEY` | Post-interview feedback scoring (Gemini). |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | AI features (resume, replies) if using OpenAI provider. |
| `INTERVIEW_LINK_BASE_URL` | Public URL of the app, used when generating interview links. |

Notes:
- `VITE_*` values are baked into the frontend at **build time**, so set them
  before `pnpm build:app` / the Docker build.
- If you rotate the ElevenLabs API key, clear `ELEVENLABS_INTERVIEW_AGENT_ID`
  and restart — a fresh agent is created automatically and logged.
- Point the ElevenLabs agent side (usage/limits) from the ElevenLabs dashboard →
  Conversational AI → Agents. The agent must belong to the same API key you deploy.
