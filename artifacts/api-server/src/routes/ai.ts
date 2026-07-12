import { Router, type IRouter } from "express";
import { readRepoEnvValue } from "../lib/loadEnv";

const router: IRouter = Router();

// Read AI config fresh from `.env` (mtime-cached) so key/base-URL edits take
// effect without restarting the api-server, falling back to process.env.
function openaiUpstream(): string {
  const base =
    readRepoEnvValue("OPENAI_BASE_URL") ??
    process.env.OPENAI_BASE_URL ??
    "https://api.freemodel.dev";
  return base.replace(/\/$/, "");
}

function openaiApiKey(): string {
  return (
    readRepoEnvValue("OPENAI_API_KEY") ??
    readRepoEnvValue("VITE_OPENAI_API_KEY") ??
    process.env.OPENAI_API_KEY ??
    process.env.VITE_OPENAI_API_KEY ??
    ""
  ).trim();
}

const UPSTREAM_TIMEOUT_MS = Number(process.env.AI_UPSTREAM_TIMEOUT_MS ?? "120000");

function normalizeUpstreamError(status: number, text: string): string {
  try {
    const parsed = JSON.parse(text) as { error?: string | { message?: string } };
    const raw =
      typeof parsed.error === "string"
        ? parsed.error
        : typeof parsed.error?.message === "string"
          ? parsed.error.message
          : text;
    if (status === 401 && /insufficient balance/i.test(raw)) {
      return JSON.stringify({
        error: {
          message:
            "Freemodel account has insufficient balance. Add credits at https://freemodel.dev, " +
            "or set VITE_AI_PROVIDER=gemini with a funded Gemini key, " +
            "or point OPENAI_BASE_URL to https://api.openai.com with a standard OpenAI API key.",
          code: "insufficient_balance",
        },
      });
    }
    if (typeof parsed.error === "string") {
      return JSON.stringify({ error: { message: parsed.error } });
    }
  } catch {
    /* keep original body */
  }
  return text;
}

async function forwardOpenAI(
  req: import("express").Request,
  res: import("express").Response,
  path: string,
): Promise<void> {
  const apiKey = openaiApiKey();
  if (!apiKey) {
    res.status(503).json({
      error: {
        message:
          "OPENAI_API_KEY not configured on the server. Set OPENAI_API_KEY in the repo root .env file and restart api-server.",
      },
    });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${openaiUpstream()}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    const text = await upstream.text();
    const body = upstream.status >= 400 ? normalizeUpstreamError(upstream.status, text) : text;
    res.status(upstream.status).set("Content-Type", "application/json").send(body);
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    res.status(502).json({
      error: {
        message: aborted
          ? `Upstream AI request timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s`
          : err instanceof Error
            ? err.message
            : "Upstream AI request failed",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

router.post("/ai/v1/responses", (req, res) => {
  void forwardOpenAI(req, res, "/v1/responses");
});

router.post("/ai/v1/chat/completions", (req, res) => {
  void forwardOpenAI(req, res, "/v1/chat/completions");
});

export default router;
