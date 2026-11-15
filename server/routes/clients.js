// Assistant: manage the client roster (list, add with optional client login).
import { Router } from 'express';
import { all, get, run, nowIso, logActivity } from '../db.js';
import { authRequired, assistantOnly } from '../auth.js';
import { hashPassword } from '../auth.js';
import crypto from 'node:crypto';

const router = Router();
router.use(authRequired, assistantOnly);

router.get('/', async (req, res) => {
  const rows = await all('SELECT * FROM clients WHERE assistant_id = ? ORDER BY id ASC', req.user.id);
  const clients = await Promise.all(rows.map(async (c) => {
    const counts = await get(`SELECT COUNT(*) AS open,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
        SUM(CASE WHEN classification = 'client' OR needs_review = 1 OR approval_status = 'pending' THEN 1 ELSE 0 END) AS attention
      FROM conversations WHERE client_id = ? AND status = 'open'`, c.id);
    const accounts = await all('SELECT id, provider, email, mode, last_synced_at FROM connected_accounts WHERE client_id = ?', c.id);
    const loginEmail = c.user_id ? (await get('SELECT email FROM users WHERE id = ?', c.user_id))?.email : null;
    return { ...c, counts, accounts, login_email: loginEmail };
  }));
  res.json({ clients });
});

// Add a client; optionally mints a client login. If no password is supplied a
// temporary one is generated and returned ONCE.
router.post('/', async (req, res) => {
  const { name, company, email, createLogin = true, password } = req.body || {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ error: 'Client name is required.' });
  if (!company || String(company).trim().length < 2) return res.status(400).json({ error: 'Company is required.' });
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return res.status(400).json({ error: 'A valid primary email is required.' });

  const palette = ['#0F766E', '#B45309', '#1D4ED8', '#7C3AED', '#BE185D'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const out = await run('INSERT INTO clients (assistant_id, name, company, email, role_title, avatar_color, created_at) VALUES (?,?,?,?,?,?,?)',
    req.user.id, String(name).trim(), String(company).trim(), cleanEmail, 'Client', color, nowIso());
  const clientId = Number(out.lastInsertRowid);

  let tempPassword = null;
  if (createLogin) {
    const existing = await get('SELECT id FROM users WHERE email = ?', cleanEmail);
    if (!existing) {
      tempPassword = password && String(password).length >= 8 ? String(password) : crypto.randomBytes(5).toString('base64url');
      const u = await run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)',
        String(name).trim(), cleanEmail, hashPassword(tempPassword), 'client', color, nowIso());
      const userId = Number(u.lastInsertRowid);
      await run('INSERT INTO settings (user_id) VALUES (?)', userId);
      await run('UPDATE clients SET user_id = ? WHERE id = ?', userId, clientId);
    } else {
      await run('UPDATE clients SET user_id = ? WHERE id = ? AND user_id IS NULL', existing.id, clientId);
    }
  }

  await logActivity(clientId, 'assistant', 'client_added', `${String(name).trim()} (${String(company).trim()}) was added to the workspace.`);
  res.json({ clientId, tempPassword, note: tempPassword ? 'Share these credentials with the client — the temporary password is shown only once.' : undefined });
});

export default router;
