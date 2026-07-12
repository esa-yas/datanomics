# Gmail Apply Label Sync

## Setup

1. Run migrations:
   - `supabase/migrations/20250614120000_gmail_apply_sync.sql`
   - `supabase/migrations/20250615120000_gmail_history_id.sql` (incremental sync cursor)
2. **Google Cloud Console** (project that owns your OAuth client):
   - [Enable Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com) — **required**; without this, connect fails with 403.
   - OAuth consent screen: add test users if app is in "Testing" mode.
   - Credentials → OAuth 2.0 Client ID (Web):
     - Authorized redirect URI = `GMAIL_OAUTH_REDIRECT_URI` (e.g. `http://localhost:5001/api/gmail/oauth/callback`)
     - Authorized JavaScript origins: `http://localhost:5173` (Vite) if needed
3. Set env vars in `.env` (see `.env.example`)
4. Run api-server: `PORT=5001 pnpm --filter @workspace/api-server run dev`
5. Run datanomics: `pnpm --filter @workspace/datanomics run dev`

After enabling Gmail API, wait 1–2 minutes before retrying OAuth.

## Auto sync

The api-server syncs all connected candidates automatically every **15 minutes** (set `GMAIL_AUTO_SYNC_INTERVAL_MINUTES`). Opening a candidate profile also triggers a background sync if data is older than 5 minutes.

Incremental sync uses Gmail **History API** (metadata scope does not support search `q` on message list). First sync lists Apply label IDs and only fetches metadata for messages not yet in the database.

## OAuth scope

`https://www.googleapis.com/auth/gmail.metadata` only — no body, no send, no modify.

## Scheduled sync

Call every 30–60 minutes:

```bash
curl -X POST http://localhost:5001/api/gmail/sync-all \
  -H "x-cron-secret: $GMAIL_CRON_SECRET"
```

Or use Supabase pg_cron + `net.http_post` to hit the edge function / api-server.

## Security

- Tokens encrypted with `GMAIL_TOKEN_ENCRYPTION_KEY` (AES-256-GCM)
- Frontend reads `google_connections_public` view only (no token columns)
- Connect links are one-time SHA-256 hashed tokens, 48h TTL
- RLS: `can_access_candidate_gmail()` for assigned staff + managers/admins
