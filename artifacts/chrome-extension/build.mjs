import { readFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const dist = join(__dirname, 'dist');
const watch = process.argv.includes('--watch');

function loadEnv() {
  const envPath = join(root, '.env');
  const vars = {};
  if (!existsSync(envPath)) return vars;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    const hash = val.indexOf(' #');
    if (hash !== -1) val = val.slice(0, hash).trim();
    vars[key] = val;
  }
  return vars;
}

const env = loadEnv();
const define = {
  __SUPABASE_URL__: JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
  __SUPABASE_ANON_KEY__: JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
  __API_BASE_URL__: JSON.stringify(
    env.VITE_EXTENSION_API_URL ?? env.API_SERVER_URL ?? 'http://localhost:5001',
  ),
};

const entries = [
  { in: 'src/background/service-worker.ts', out: 'background.js' },
  { in: 'src/popup/popup.ts', out: 'popup/popup.js' },
  { in: 'src/sidepanel/sidepanel.ts', out: 'sidepanel/sidepanel.js' },
  { in: 'src/content/linkedin.ts', out: 'content/linkedin.js' },
  { in: 'src/content/gmail.ts', out: 'content/gmail.js' },
  { in: 'src/content/indeed.ts', out: 'content/indeed.js' },
];

const sharedOptions = {
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  define,
  logLevel: 'info',
};

async function buildOnce() {
  mkdirSync(dist, { recursive: true });
  mkdirSync(join(dist, 'popup'), { recursive: true });
  mkdirSync(join(dist, 'sidepanel'), { recursive: true });
  mkdirSync(join(dist, 'content'), { recursive: true });

  await Promise.all(
    entries.map((e) =>
      esbuild.build({
        ...sharedOptions,
        entryPoints: [join(__dirname, e.in)],
        outfile: join(dist, e.out),
      }),
    ),
  );

  cpSync(join(__dirname, 'manifest.json'), join(dist, 'manifest.json'));
  cpSync(join(__dirname, 'src/popup/index.html'), join(dist, 'popup/index.html'));
  cpSync(join(__dirname, 'src/popup/popup.css'), join(dist, 'popup/popup.css'));
  cpSync(join(__dirname, 'src/sidepanel/index.html'), join(dist, 'sidepanel/index.html'));
  cpSync(join(__dirname, 'src/sidepanel/sidepanel.css'), join(dist, 'sidepanel/sidepanel.css'));
  if (existsSync(join(__dirname, 'icons'))) {
    cpSync(join(__dirname, 'icons'), join(dist, 'icons'), { recursive: true });
  }
  console.log('Built chrome extension → artifacts/chrome-extension/dist');
}

async function build() {
  if (watch) {
    const contexts = await Promise.all(
      entries.map((e) =>
        esbuild.context({
          ...sharedOptions,
          entryPoints: [join(__dirname, e.in)],
          outfile: join(dist, e.out),
        }),
      ),
    );
    await Promise.all(contexts.map((c) => c.watch()));
    console.log('Watching chrome-extension…');
    await buildOnce();
  } else {
    await buildOnce();
  }
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
