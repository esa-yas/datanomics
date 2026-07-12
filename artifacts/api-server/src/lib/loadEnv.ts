import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;
let resolvedEnvPath: string | null | undefined;

function findEnvPath(): string | null {
  if (resolvedEnvPath !== undefined) return resolvedEnvPath;

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../../.env'),
    resolve(here, '../../../../.env'),
    resolve(here, '../../.env'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  resolvedEnvPath = candidates.find((path) => existsSync(path)) ?? null;
  return resolvedEnvPath;
}

/** Load repo-root `.env` into process.env (does not override existing vars). */
export function loadRepoEnv(): void {
  if (loaded) return;

  const path = findEnvPath();
  if (path) {
    parseEnvFile(path);
    loaded = true;
  }
}

let cachedEnv: Record<string, string> = {};
let cachedMtimeMs = -1;

/** Parse the repo `.env` fresh, re-reading only when the file changes (mtime cache). */
function readRepoEnvFile(): Record<string, string> {
  const path = findEnvPath();
  if (!path) return {};
  try {
    const mtimeMs = statSync(path).mtimeMs;
    if (mtimeMs !== cachedMtimeMs) {
      cachedEnv = parseEnvText(readFileSync(path, 'utf8'));
      cachedMtimeMs = mtimeMs;
    }
  } catch {
    return cachedEnv;
  }
  return cachedEnv;
}

/**
 * Read a value straight from the repo `.env` file (fresh, mtime-cached).
 *
 * Use this for values the operator edits at runtime (e.g. AI keys). The dev
 * server only restarts Vite on `.env` changes — the api-server process keeps its
 * original `process.env`, so a plain `process.env` read would return a stale key
 * after an edit. This always reflects the current file.
 */
export function readRepoEnvValue(key: string): string | undefined {
  const value = readRepoEnvFile()[key];
  return value && value.length > 0 ? value : undefined;
}

/** Parse `.env` text into a map. Last assignment wins (duplicate keys are common during edits). */
function parseEnvText(text: string): Record<string, string> {
  const fromFile: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentAt = value.search(/\s+#/);
      if (commentAt !== -1) value = value.slice(0, commentAt).trim();
    }
    fromFile[key] = value;
  }
  return fromFile;
}

function parseEnvFile(path: string): void {
  const fromFile = parseEnvText(readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// Run as soon as this module loads — before route modules read process.env
loadRepoEnv();
