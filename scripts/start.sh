#!/usr/bin/env bash
# Production single-service start:
#   - Builds the frontend, builds the api-server, then runs ONE Node process
#     that serves BOTH the API and the built UI (including /interview) on $PORT.
#
# Deploy target: any host that runs Node (Railway, Render, Fly.io, a VPS, Docker).
# Required env: PORT, ELEVENLABS_API_KEY, SUPABASE_SERVICE_ROLE_KEY,
#               VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_GEMINI_API_KEY.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-5001}"

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "==> Building frontend..."
  ( cd artifacts/datanomics && ./node_modules/.bin/vite build --config vite.config.ts )

  echo "==> Building api-server..."
  ( cd artifacts/api-server && node build.mjs )
fi

echo "==> Starting single-service app on :${PORT} ..."
exec node --enable-source-maps artifacts/api-server/dist/index.mjs
