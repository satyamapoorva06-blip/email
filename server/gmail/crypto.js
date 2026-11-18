// Symmetric encryption for stored Gmail OAuth tokens (AES-256-GCM).
// Key resolution, in order:
//   1. GMAIL_TOKEN_SECRET env var (32+ chars or hex-64) — required in production.
//   2. Local dev only: a random key persisted to ./data/.gmail-key (gitignored).
// Failure in production = refuse to encrypt/decrypt rather than store weak material.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY_FILE = path.join(__dirname, '..', '..', 'data', '.gmail-key');

function keyFromSecret(secret) {
  const s = String(secret).trim();
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  return crypto.createHash('sha256').update(s, 'utf8').digest();
}

export function tokenKey() {
  const fromEnv = process.env.GMAIL_TOKEN_SECRET;
  if (fromEnv && fromEnv.trim().length >= 16) return keyFromSecret(fromEnv);
  if (process.env.VERCEL) {
    // Do not invent ephemeral key material on a serverless host — tokens would be
    // unreadable after the next cold start anyway. Fail loudly and clearly.
    throw new Error('GMAIL_TOKEN_SECRET is not set. Add a random 32+ character secret in Vercel env (see README) before connecting Gmail.');
  }
  try {
    const existing = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(existing)) return Buffer.from(existing, 'hex');
  } catch { /* first run */ }
  const generated = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(KEY_FILE), { recursive: true });
  fs.writeFileSync(KEY_FILE, generated, { mode: 0o600 });
  return Buffer.from(generated, 'hex');
}

export function tokenKeyConfigured() {
  try { tokenKey(); return true; } catch { return false; }
}

export function encryptToken(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ct.toString('base64url')}`;
}

export function decryptToken(payload) {
  if (!payload) return null;
  const [v, ivB64, tagB64, ctB64] = String(payload).split('.');
  if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) throw new Error('Stored token is corrupt (bad format). Disconnect and reconnect Gmail.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64url')), decipher.final()]).toString('utf8');
}
