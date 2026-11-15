// Express entry point. Serves the JSON API under /api and, in production, the
// built React app from client/dist (single origin — no CORS needed).
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3001);

// Seed on first boot (no-op when the DB already has users)
process.env.SEED_ON_BOOT !== '0' && await import('./seed.js').catch((err) => console.error('[seed] failed:', err));

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

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: process.env.OPENAI_API_KEY ? 'llm' : 'fallback' }));
app.use('/api/auth', authRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/client', clientRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api', overviewRoutes);   // /api/stats, /api/activity, /api/meetings
app.use('/api', opsRoutes);        // /api/accounts, /api/settings, /api/notifications
app.use('/api/ai', aiRoutes);

// Static frontend (built via `npm run build`)
const dist = path.join(root, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// API 404 + central error handler (never leak stack traces to the client)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our side.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay listening on http://0.0.0.0:${PORT}  (AI engine: ${process.env.OPENAI_API_KEY ? 'llm' : 'fallback rules'})`);
});
