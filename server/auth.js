// Password hashing (scrypt, built-in) + session-token auth middleware.
import crypto from 'node:crypto';
import { get, run, all, nowIso } from './db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, expected] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

const SESSION_DAYS = 30;

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  await run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', token, userId, nowIso(), expires);
  return token;
}

export async function destroySession(token) {
  await run('DELETE FROM sessions WHERE token = ?', token);
}

export function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, avatar_color: u.avatar_color };
}

// Requires a valid Bearer token. Attaches req.user and req.clientIds
// (the client records this user may see).
export async function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  const row = await get('SELECT * FROM sessions WHERE token = ?', token);
  if (!row) return res.status(401).json({ error: 'Session expired — please sign in again.' });
  if (new Date(row.expires_at) < new Date()) {
    await destroySession(token);
    return res.status(401).json({ error: 'Session expired — please sign in again.' });
  }
  const user = await get('SELECT * FROM users WHERE id = ?', row.user_id);
  if (!user) return res.status(401).json({ error: 'Account not found.' });
  req.user = user;
  req.token = token;
  if (user.role === 'assistant') {
    req.clientIds = (await all('SELECT id FROM clients WHERE assistant_id = ?', user.id)).map((r) => r.id);
  } else if (user.role === 'client') {
    const row2 = await get('SELECT id FROM clients WHERE user_id = ?', user.id);
    req.clientIds = row2 ? [row2.id] : [];
  } else {
    req.clientIds = [];
  }
  next();
}

export function assistantOnly(req, res, next) {
  if (req.user.role !== 'assistant') return res.status(403).json({ error: 'This area is for personal assistants.' });
  next();
}

export function clientOnly(req, res, next) {
  if (req.user.role !== 'client') return res.status(403).json({ error: 'This area is for clients.' });
  next();
}

// Resolve a client_id from the request, enforcing ownership.
export function resolveClientId(req) {
  const q = req.query.clientId ?? req.body?.clientId;
  if (q != null && q !== '' && q !== 'all') {
    const id = Number(q);
    if (!req.clientIds.includes(id)) return { error: 'Unknown client.' };
    return { clientId: id };
  }
  return { clientId: null }; // all accessible clients
}

export function scopeClause(req, column = 'client_id') {
  const { clientId } = resolveClientId(req);
  if (clientId != null) return { clause: `${column} = ?`, params: [clientId], clientId };
  if (req.clientIds.length === 0) return { clause: '1 = 0', params: [], clientId: null };
  return { clause: `${column} IN (${req.clientIds.map(() => '?').join(',')})`, params: [...req.clientIds], clientId: null };
}
