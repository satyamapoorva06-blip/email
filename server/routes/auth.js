// Auth routes: register, login, logout, role selection, profile.
import { Router } from 'express';
import { get, run, nowIso } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, publicUser, authRequired } from '../auth.js';

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!email || !EMAIL_RE.test(String(email).trim())) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const cleanEmail = String(email).trim().toLowerCase();
  if (get('SELECT id FROM users WHERE email = ?', cleanEmail)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const out = run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)',
    String(name).trim(), cleanEmail, hashPassword(String(password)), null, '#4F46E5', nowIso());
  const userId = Number(out.lastInsertRowid);
  run('INSERT INTO settings (user_id) VALUES (?)', userId);
  const token = createSession(userId);
  res.json({ token, user: publicUser(get('SELECT * FROM users WHERE id = ?', userId)) });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', cleanEmail);
  if (!user || !verifyPassword(String(password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  const token = createSession(user.id);
  res.json({ token, user: publicUser(user) });
});

router.post('/logout', authRequired, (req, res) => {
  destroySession(req.token);
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const linked = req.user.role === 'client' ? get('SELECT id FROM clients WHERE user_id = ?', req.user.id) : null;
  res.json({ user: publicUser(req.user), clientId: linked?.id || null });
});

// First-time role selection after registration (assistant vs client).
router.put('/role', authRequired, (req, res) => {
  const { role } = req.body || {};
  if (!['assistant', 'client'].includes(role)) return res.status(400).json({ error: 'Choose a valid role.' });
  if (req.user.role && req.user.role !== role) return res.status(400).json({ error: 'Your role is already set. Contact support to change it.' });
  run('UPDATE users SET role = ? WHERE id = ?', role, req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

router.put('/profile', authRequired, (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name.length >= 2) run('UPDATE users SET name = ? WHERE id = ?', name, req.user.id);
  res.json({ user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

export default router;
