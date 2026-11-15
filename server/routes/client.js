// Client-facing routes: a deliberately simple, minimal inbox.
// Clients only ever see threads that need THEM — never the assistant's queue.
import { Router } from 'express';
import { all, get, run, nowIso, logActivity, notifyAssistants } from '../db.js';
import { authRequired, clientOnly } from '../auth.js';

const router = Router();
router.use(authRequired, clientOnly);

const hydrate = (row) => ({
  ...row,
  is_read: !!row.is_read,
  is_starred: !!row.is_starred,
  preview: (get('SELECT body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1', row.id)?.body || '').replace(/\s+/g, ' ').slice(0, 160),
});

function myClient(req) {
  return get('SELECT * FROM clients WHERE user_id = ?', req.user.id);
}

// GET /api/client/overview — welcome data + attention list
router.get('/overview', (req, res) => {
  const client = myClient(req);
  if (!client) return res.json({ client: null, attention: [], stats: { handled: 0, approvals: 0 } });
  const attention = all(`SELECT * FROM conversations
      WHERE client_id = ? AND status = 'open' AND (approval_status = 'pending' OR (classification = 'client' AND approval_status = 'none'))
      ORDER BY importance = 'high' DESC, last_activity_at DESC`, client.id).map(hydrate);
  const handled = get(`SELECT COUNT(*) AS n FROM activity_log WHERE client_id = ? AND actor_role = 'client' AND action = 'marked_handled' AND created_at >= ?`, client.id, new Date(Date.now() - 30 * 864e5).toISOString()).n;
  const approvals = get(`SELECT COUNT(*) AS n FROM conversations WHERE client_id = ? AND status = 'open' AND approval_status = 'pending'`, client.id).n;
  const assistant = get('SELECT name FROM users WHERE id = ?', client.assistant_id);
  res.json({ client: { id: client.id, name: client.name, company: client.company, email: client.email, avatar_color: client.avatar_color }, assistant: assistant?.name || 'your assistant', attention, stats: { handled, approvals } });
});

// GET /api/client/conversations?includeAll=1 — attention list, or everything on request
router.get('/conversations', (req, res) => {
  const client = myClient(req);
  if (!client) return res.json({ conversations: [] });
  const includeAll = req.query.includeAll === '1';
  const where = includeAll
    ? `client_id = ? AND status = 'open'`
    : `client_id = ? AND status = 'open' AND (approval_status = 'pending' OR (classification = 'client' AND approval_status = 'none'))`;
  const rows = all(`SELECT * FROM conversations WHERE ${where} ORDER BY importance = 'high' DESC, last_activity_at DESC`, client.id).map(hydrate);
  res.json({ conversations: rows, filtered: !includeAll });
});

// GET /api/client/conversations/:id — full thread (own client's threads only)
router.get('/conversations/:id(\\d+)', (req, res) => {
  const client = myClient(req);
  const convo = client && get('SELECT * FROM conversations WHERE id = ? AND client_id = ?', req.params.id, client.id);
  if (!convo) return res.status(404).json({ error: 'Not found.' });
  const messages = all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', convo.id);
  run('UPDATE conversations SET is_read = 1 WHERE id = ?', convo.id);
  res.json({ conversation: hydrate(convo), messages, client: { name: client.name, company: client.company } });
});

// POST /api/client/conversations/:id/action { action: 'handled' | 'ask_assistant', note? }
router.post('/conversations/:id(\\d+)/action', (req, res) => {
  const client = myClient(req);
  const convo = client && get('SELECT * FROM conversations WHERE id = ? AND client_id = ?', req.params.id, client.id);
  if (!convo) return res.status(404).json({ error: 'Not found.' });
  const note = String(req.body?.note || '').trim().slice(0, 1000);
  if (req.body?.action === 'handled') {
    run(`UPDATE conversations SET status = 'completed', approval_status = CASE WHEN approval_status = 'pending' THEN 'approved' ELSE approval_status END, last_activity_at = ? WHERE id = ?`, nowIso(), convo.id);
    logActivity(client.id, 'client', 'marked_handled', `${client.name} marked “${convo.subject}” as handled.`);
    notifyAssistants(client.id, 'Client marked an email handled', `${client.name} handled “${convo.subject}”.`);
  } else if (req.body?.action === 'ask_assistant') {
    run(`UPDATE conversations SET classification = 'assistant', needs_review = 0, suggested_action = 'Client asked the assistant to handle this.', last_activity_at = ? WHERE id = ?`, nowIso(), convo.id);
    if (note) run(`INSERT INTO messages (conversation_id, sender_name, sender_email, body, direction, created_at) VALUES (?,?,?,?,?,?)`,
      convo.id, `${client.name} (note to assistant)`, client.email, note, 'note', nowIso());
    logActivity(client.id, 'client', 'asked_assistant', `${client.name} asked the assistant to handle “${convo.subject}”.${note ? ` Note: ${note}` : ''}`);
    notifyAssistants(client.id, 'Client asked you to handle an email', `${client.name}: “${convo.subject}”`);
  } else {
    return res.status(400).json({ error: 'Unknown action.' });
  }
  res.json({ ok: true });
});

// POST /api/client/conversations/:id/approval { decision: 'approved' | 'rejected' }
router.post('/conversations/:id(\\d+)/approval', (req, res) => {
  const client = myClient(req);
  const convo = client && get('SELECT * FROM conversations WHERE id = ? AND client_id = ?', req.params.id, client.id);
  if (!convo) return res.status(404).json({ error: 'Not found.' });
  const decision = req.body?.decision;
  if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Choose approve or reject.' });
  run(`UPDATE conversations SET approval_status = ?, suggested_action = ?, last_activity_at = ? WHERE id = ?`,
    decision,
    decision === 'approved' ? 'Client approved — confirm with the counterparty and proceed.' : 'Client rejected — do not proceed; inform the counterparty.',
    nowIso(), convo.id);
  logActivity(client.id, 'client', decision === 'approved' ? 'approved' : 'rejected', `${client.name} ${decision} the request in “${convo.subject}”.`);
  notifyAssistants(client.id, `Client ${decision} a request`, `${client.name} ${decision}: “${convo.subject}”`);
  res.json({ ok: true });
});

export default router;
