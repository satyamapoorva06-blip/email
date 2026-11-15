// Vercel serverless entry — every /api/* request is routed here (catch-all).
// The Express app sees the original URL (e.g. /api/emails/12), exactly like
// when it runs stand-alone; it just never listens.
import app from '../server/index.js';

export default app;
