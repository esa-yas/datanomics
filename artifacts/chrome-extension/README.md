# Datanomics Reply Assistant — Chrome Extension

AI recruiter reply drafts for **LinkedIn**, **Gmail**, and **Indeed**, using the same Supabase auth and candidate data as Job Search OS.

## Features

- **Same login** as the web app (Supabase email/password)
- **Side panel** — select candidate, intent, generate reply, copy to clipboard
- **Auto-capture** — reads conversation text from the active tab (LinkedIn messages, Gmail threads, Indeed messages)
- **Manual paste** — paste any conversation if auto-capture misses something
- **RBAC** — candidate list respects Supabase RLS (job search assistants only see assigned candidates)

## Prerequisites

1. Job Search OS `.env` configured (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OPENAI_API_KEY`)
2. **api-server** running (`PORT=5001 pnpm --filter @workspace/api-server run dev`)
3. Staff user account in Supabase

## Build

From repo root:

```bash
pnpm install
pnpm --filter @workspace/chrome-extension run build
```

The build reads `VITE_SUPABASE_*` and `VITE_EXTENSION_API_URL` (or `API_SERVER_URL`) from the repo root `.env`.

Output: `artifacts/chrome-extension/dist/`

## Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `artifacts/chrome-extension/dist`

## Usage

1. Click the extension icon → **Sign in** with your Job Search OS credentials
2. Open a recruiter thread on **LinkedIn**, **Gmail**, or **Indeed**
3. Click **Open reply panel** (or use Chrome’s side panel for the extension)
4. Conversation text auto-fills when detected (green badge on icon)
5. Select **candidate** and **intent** → **Generate reply** → **Copy** → paste into the recruiter chat

## Production deployment

Set in `.env` before building:

```env
VITE_EXTENSION_API_URL=https://your-api.example.com
```

Ensure api-server CORS allows requests from `chrome-extension://` origins (default `cors()` is open).

## API endpoints (api-server)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/extension/recruiter-reply` | Bearer JWT (staff) |
| GET | `/api/extension/intents` | Bearer JWT (staff) |

## Development

```bash
pnpm --filter @workspace/chrome-extension run dev
```

Rebuild after code changes, then click **Reload** on `chrome://extensions`.
