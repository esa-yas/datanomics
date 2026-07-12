import "./lib/loadEnv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Single-service mode: serve the built frontend (incl. the /interview UI) so the
// whole app — backend + interview — runs from one process/terminal in production.
const here = path.dirname(fileURLToPath(import.meta.url));
const webDistDir =
  process.env["WEB_DIST_DIR"]?.trim() ||
  path.resolve(here, "../../datanomics/dist/public");

if (existsSync(path.join(webDistDir, "index.html"))) {
  app.use(express.static(webDistDir));
  // SPA fallback: any non-API GET returns index.html so client-side routes
  // (e.g. /interview/:token) work on direct load / refresh.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(webDistDir, "index.html"));
  });
  logger.info({ webDistDir }, "Serving frontend from api-server (single-service mode)");
} else {
  logger.info(
    { webDistDir },
    "Frontend build not found — API only (run the web build for single-service mode)",
  );
}

export default app;
