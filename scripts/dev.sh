#!/usr/bin/env bash
# Run the whole app locally from ONE terminal:
#   - api-server (backend + voice interview endpoints) on :5001
#   - Vite dev server (frontend, proxies /api -> :5001) on :5173
#
# Ctrl-C stops both. The interview UI (http://localhost:5173/interview/<token>)
# talks to the backend through the Vite proxy, so voice interviews work end-to-end.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

API_PORT="${API_PORT:-5001}"

echo "==> Building api-server..."
( cd artifacts/api-server && node build.mjs )

echo "==> Starting api-server on :${API_PORT} ..."
PORT="${API_PORT}" node --enable-source-maps artifacts/api-server/dist/index.mjs &
API_PID=$!

cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill "${API_PID}" 2>/dev/null || true
  wait "${API_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Give the API a moment to bind before the UI starts proxying to it.
sleep 1

echo "==> Starting frontend (Vite) ..."
cd artifacts/datanomics
exec ./node_modules/.bin/vite --config vite.config.ts --host 0.0.0.0
