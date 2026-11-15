// Connected accounts (demo OAuth), settings, and notifications.
import { Router } from 'express';
import { all, get, run, nowIso, logActivity } from '../db.js';
import { authRequired, assistantOnly } from '../auth.js';

const router = Router();
router.param('id', (_req, res, next, value) => {
  if (!/^\d+$/.test(String(value))) return res.status(404).json({ error: 'Not found.' });
  next();
});
router.use(authRequired);

// --- Connected accounts --------------------------------------------------
// Real OAuth (Gmail/Outlook) requires provider client credentials that are not
// configured in this environment. The connect flow is therefore a clearly
// labelled SIMULATION: it creates a connected account flagged mode='simulated'.
router.get('/accounts', assistantOnly, async (req, res) => {
  const rows = await all(`SELECT a.*, c.name AS client_name, c.company AS client_company, c.avatar_color AS client_color
    FROM connected_accounts a JOIN clients c ON c.id = a.client_id
    WHERE c.assistant_id = ? ORDER BY c.id, a.provider`, req.user.id);
  res.json({ accounts: rows });
});

router.post('/accounts/connect', assistantOnly, async (req, res) => {
  const { clientId, provider, email } = req.body || {};
  const cid = Number(clientId);
  if (!req.clientIds.includes(cid)) return res.status(400).json({ error: 'Unknown client.' });
  if (!['gmail', 'outlook'].includes(provider)) return res.status(400).json({ error: 'Choose Gmail or Outlook.' });
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) return res.status(400).json({ error: 'Enter the mailbox address to connect.' });
  if ((await all('SELECT id FROM connected_accounts WHERE client_id = ? AND email = ?', cid, cleanEmail)).length) {
    return res.status(409).json({ error: 'That mailbox is already connected.' });
  }
  const out = await run(`INSERT INTO connected_accounts (client_id, provider, email, status, mode, last_synced_at, created_at) VALUES (?,?,?,?,?,?,?)`,
    cid, provider, cleanEmail, 'connected', 'simulated', nowIso(), nowIso());
  const client = await get('SELECT name FROM clients WHERE id = ?', cid);
  await logActivity(cid, 'system', 'account_connected', `Simulated ${provider === 'gmail' ? 'Gmail' : 'Outlook'} connection for ${cleanEmail} (${client?.name}). Demo mode — no real credentials were used.`);
  res.json({ ok: true, accountId: Number(out.lastInsertRowid), mode: 'simulated' });
});

router.post('/accounts/:id/sync', assistantOnly, async (req, res) => {
  const account = await get('SELECT a.* FROM connected_accounts a JOIN clients c ON c.id = a.client_id WHERE a.id = ? AND c.assistant_id = ?', req.params.id, req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  await run('UPDATE connected_accounts SET last_synced_at = ?, status = ? WHERE id = ?', nowIso(), 'connected', account.id);
  await logActivity(account.client_id, 'system', 'synced', `Mailbox ${account.email} synced (${account.mode === 'simulated' ? 'simulated sync' : 'real sync'}).`);
  res.json({ ok: true });
});

router.delete('/accounts/:id', assistantOnly, async (req, res) => {
  const account = await get('SELECT a.* FROM connected_accounts a JOIN clients c ON c.id = a.client_id WHERE a.id = ? AND c.assistant_id = ?', req.params.id, req.user.id);
  if (!account) return res.status(404).json({ error: 'Account not found.' });
  await run('DELETE FROM connected_accounts WHERE id = ?', account.id);
  await logActivity(account.client_id, 'system', 'account_disconnected', `${account.email} was disconnected.`);
  res.json({ ok: true });
});

// --- Settings -------------------------------------------------------------
const bool = (v, fallback = 0) => (v === undefined ? fallback : v ? 1 : 0);

router.get('/settings', async (req, res) => {
  let row = await get('SELECT * FROM settings WHERE user_id = ?', req.user.id);
  if (!row) { await run('INSERT INTO settings (user_id) VALUES (?)', req.user.id); row = await get('SELECT * FROM settings WHERE user_id = ?', req.user.id); }
  res.json({ settings: { ...row, auto_classify: !!row.auto_classify, review_low_confidence: !!row.review_low_confidence, notify_high_importance: !!row.notify_high_importance, notify_client_actions: !!row.notify_client_actions, weekly_digest: !!row.weekly_digest } });
});

router.put('/settings', async (req, res) => {
  const body = req.body || {};
  const signature = String(body.signature ?? '').slice(0, 600);
  const timezone = String(body.timezone ?? 'Asia/Kolkata').slice(0, 64);
  await run(`INSERT INTO settings (user_id, signature, auto_classify, review_low_confidence, notify_high_importance, notify_client_actions, weekly_digest, timezone)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET signature=excluded.signature, auto_classify=excluded.auto_classify,
         review_low_confidence=excluded.review_low_confidence, notify_high_importance=excluded.notify_high_importance,
         notify_client_actions=excluded.notify_client_actions, weekly_digest=excluded.weekly_digest, timezone=excluded.timezone`,
    req.user.id, signature, bool(body.auto_classify, 1), bool(body.review_low_confidence, 1),
    bool(body.notify_high_importance, 1), bool(body.notify_client_actions, 1), bool(body.weekly_digest, 0), timezone);
  res.json({ ok: true });
});

// --- Notifications ---------------------------------------------------------
router.get('/notifications', async (req, res) => {
  const rows = await all('SELECT * FROM notifications WHERE user_id = ? ORDER BY read ASC, created_at DESC LIMIT 30', req.user.id);
  res.json({ notifications: rows.map((n) => ({ ...n, read: !!n.read })), unread: rows.filter((n) => !n.read).length });
});

router.post('/notifications/read', async (req, res) => {
  if (req.body?.all) await run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  else if (Array.isArray(req.body?.ids) && req.body.ids.length) {
    await run(`UPDATE notifications SET read = 1 WHERE user_id = ? AND id IN (${req.body.ids.map(() => '?').join(',')})`, req.user.id, ...req.body.ids.map(Number));
  }
  res.json({ ok: true });
});

export default router;
