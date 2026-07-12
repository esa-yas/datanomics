import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const appRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(appRoot, "../..");

const mode = process.env.NODE_ENV === "production" ? "production" : "development";
const env = loadEnv(mode, repoRoot, "");

const rawPort = env.PORT ?? process.env.PORT ?? "5173";
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = env.BASE_PATH ?? process.env.BASE_PATH ?? "/";
const openaiUpstream = (env.OPENAI_BASE_URL ?? "https://api.freemodel.dev").replace(/\/$/, "");
const openaiApiKey = env.OPENAI_API_KEY ?? env.VITE_OPENAI_API_KEY ?? "";
const apiServerUrl = (env.API_SERVER_URL ?? env.VITE_API_URL ?? "http://localhost:5001").replace(
  /\/$/,
  "",
);

const replitPlugins =
  mode !== "production" && process.env.REPL_ID !== undefined
    ? [
        (await import("@replit/vite-plugin-cartographer")).cartographer({
          root: path.resolve(appRoot, ".."),
        }),
        (await import("@replit/vite-plugin-dev-banner")).devBanner(),
      ]
    : [];

export default defineConfig({
  envDir: repoRoot,
  base: basePath,
  plugins: [react(), tailwindcss(), runtimeErrorOverlay(), ...replitPlugins],
  resolve: {
    alias: {
      "@": path.resolve(appRoot, "src"),
      "@assets": path.resolve(repoRoot, "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: appRoot,
  build: {
    outDir: path.resolve(appRoot, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-charts": ["recharts"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-switch",
            "@radix-ui/react-checkbox",
          ],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/api/gmail": {
        target: apiServerUrl,
        changeOrigin: true,
      },
      "/api/job-research": {
        target: apiServerUrl,
        changeOrigin: true,
      },
      "/api/interview-practice": {
        target: apiServerUrl,
        changeOrigin: true,
        ws: true,
      },
      "/api/ai": {
        target: apiServerUrl,
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
