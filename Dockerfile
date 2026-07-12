# Single-service image: builds the frontend + api-server and runs ONE process
# that serves both the API and the interview UI. Deploy anywhere that runs
# containers (Railway, Render, Fly.io, Cloud Run, a VPS, etc.).

FROM node:24-slim AS build
WORKDIR /app

RUN corepack enable

# Install deps first (better layer caching).
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig*.json ./

RUN pnpm install --frozen-lockfile

# Build frontend (dist/public) + api-server (dist/index.mjs).
RUN pnpm run build:app

# ---- Runtime image ----
FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable

# Bring the whole built workspace (node_modules + dist) from the build stage.
COPY --from=build /app /app

# Container port — override with -e PORT=... if the platform requires it.
ENV PORT=8080
EXPOSE 8080

# Runs the already-built single-service app (skips rebuild inside container).
ENV SKIP_BUILD=1
CMD ["bash", "scripts/start.sh"]
