// Express app — JSON API under /api and, in production, the built React app
// from client/dist (single origin — no CORS needed).
//
// Local/self-hosted: `node server/index.js` boots and listens on $PORT (3001).
// On Vercel: the same app is imported by api/[...slug].js as a serverless
// function — no listener, no boot-seed (seeding happens via scripts/pg-dump.mjs
// + the Supabase migration, not on cold starts).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);
const ON_VERCEL = Boolean(process.env.VERCEL);

// Seed on first boot for self-hosted fresh databases (no-op when users exist).
// Never on serverless cold starts; set SEED_ON_BOOT=0 to silence elsewhere too.
if (!ON_VERCEL && process.env.SEED_ON_BOOT !== '0') {
  await import('./seed.js').catch((err) => console.error('[seed] failed:', err));
}

const { default: authRoutes } = await import('./routes/auth.js');
const { default: emailRoutes } = await import('./routes/emails.js');
const { default: clientRoutes } = await import('./routes/client.js');
const { default: clientsRoutes } = await import('./routes/clients.js');
const { default: overviewRoutes } = await import('./routes/overview.js');
const { default: opsRoutes } = await import('./routes/ops.js');
const { default: aiRoutes } = await import('./routes/ai.js');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  // Public liveness probe — also reports whether the database answers SELECT 1.
  // No secrets, no data. Bounded so a hung connection can't stall the probe.
  let reachable = false;
  try {
    const { get } = await import('./db.js');
    reachable = await Promise.race([
      get('SELECT 1 AS one').then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
  } catch {
    reachable = false;
  }
  res.json({ ok: true, ai: process.env.OPENAI_API_KEY ? 'llm' : 'fallback', db: process.env.DATABASE_URL ? 'postgres' : 'sqlite', reachable });
});
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api', overviewRoutes);   // /api/stats, /api/activity, /api/meetings
app.use('/api', opsRoutes);        // /api/accounts, /api/settings, /api/notifications
app.use('/api/ai', aiRoutes);

// Static frontend (built via `npm run build`) — self-hosted serving; on Vercel
// the static files are served by the platform and only /api hits this app.
const dist = path.join(root, 'client', 'dist');
if (!ON_VERCEL && fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  // SPA fallback without a wildcard pattern (Express 5 path-to-regexp).
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// API 404 + central error handler (never leak stack traces to the client).
// Express 5 forwards rejected promises from async handlers here automatically.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

export default app;

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (!ON_VERCEL && invokedDirectly) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Relay listening on http://0.0.0.0:${PORT}  (AI engine: ${process.env.OPENAI_API_KEY ? 'llm' : 'fallback rules'}, DB: ${process.env.DATABASE_URL ? 'postgres' : 'sqlite'})`);
  });
}
