// Stats, activity timeline and meetings.
import { Router } from 'express';
import { all, get, run, nowIso, logActivity } from '../db.js';
import { authRequired, assistantOnly, scopeClause } from '../auth.js';

const router = Router();
router.use(authRequired);

// GET /api/stats?clientId= — the four headline numbers on the dashboard
router.get('/stats', assistantOnly, (req, res) => {
  const scope = scopeClause(req, 'client_id');
  const row = get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN classification = 'client' OR needs_review = 1 OR approval_status = 'pending' THEN 1 ELSE 0 END) AS needs_action,
      SUM(CASE WHEN classification = 'client' THEN 1 ELSE 0 END) AS client_attention,
      SUM(CASE WHEN classification = 'assistant' THEN 1 ELSE 0 END) AS assistant_to_reply,
      SUM(CASE WHEN waiting_since IS NOT NULL THEN 1 ELSE 0 END) AS waiting,
      SUM(CASE WHEN importance = 'high' OR is_starred = 1 THEN 1 ELSE 0 END) AS important
    FROM conversations WHERE status = 'open' AND ${scope.clause}`, ...scope.params);
  res.json({
    total: row.total || 0,
    unread: row.unread || 0,
    needsAction: row.needs_action || 0,
    clientAttention: row.client_attention || 0,
    assistantToReply: row.assistant_to_reply || 0,
    waiting: row.waiting || 0,
    important: row.important || 0,
  });
});

// GET /api/activity?clientId=&limit= — chronological audit trail
router.get('/activity', assistantOnly, (req, res) => {
  const scope = scopeClause(req, 'a.client_id');
  const limit = Math.min(Number(req.query.limit) || 40, 100);
  const rows = all(`SELECT a.*, c.name AS client_name FROM activity_log a LEFT JOIN clients c ON c.id = a.client_id
    WHERE ${scope.clause} ORDER BY a.created_at DESC LIMIT ?`, ...scope.params, limit);
  res.json({ activity: rows });
});

// GET /api/meetings?clientId=&range=upcoming|past — calendar-ish list
router.get('/meetings', assistantOnly, (req, res) => {
  const scope = scopeClause(req, 'm.client_id');
  const range = req.query.range === 'past' ? 'past' : 'upcoming';
  const op = range === 'upcoming' ? '>=' : '<';
  const rows = all(`SELECT m.*, c.name AS client_name, c.avatar_color AS client_color
    FROM meetings m JOIN clients c ON c.id = m.client_id
    WHERE ${scope.clause} AND m.start_at ${op} ? ORDER BY m.start_at ${range === 'upcoming' ? 'ASC' : 'DESC'} LIMIT 50`,
    ...scope.params, new Date().toISOString());
  res.json({ meetings: rows });
});

// POST /api/meetings — manual add
router.post('/meetings', assistantOnly, (req, res) => {
  const { clientId, title, start_at, end_at, location, attendees, conversation_id } = req.body || {};
  const cid = Number(clientId);
  if (!req.clientIds.includes(cid)) return res.status(400).json({ error: 'Unknown client.' });
  if (!title || String(title).trim().length < 3) return res.status(400).json({ error: 'A meeting title is required.' });
  if (Number.isNaN(Date.parse(start_at))) return res.status(400).json({ error: 'A valid start time is required.' });
  const start = new Date(start_at).toISOString();
  const end = end_at && !Number.isNaN(Date.parse(end_at)) ? new Date(end_at).toISOString() : new Date(Date.parse(start_at) + 45 * 60000).toISOString();
  const out = run('INSERT INTO meetings (client_id, conversation_id, title, start_at, end_at, location, attendees, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    cid, conversation_id || null, String(title).trim(), start, end, String(location || '').slice(0, 160), String(attendees || '').slice(0, 300), 'manual', nowIso());
  logActivity(cid, 'assistant', 'meeting_added', `Meeting “${String(title).trim()}” added to the calendar.`);
  res.json({ ok: true, meetingId: Number(out.lastInsertRowid) });
});

router.delete('/meetings/:id(\\d+)', assistantOnly, (req, res) => {
  const m = get('SELECT * FROM meetings WHERE id = ?', req.params.id);
  if (!m || !req.clientIds.includes(m.client_id)) return res.status(404).json({ error: 'Meeting not found.' });
  run('DELETE FROM meetings WHERE id = ?', m.id);
  logActivity(m.client_id, 'assistant', 'meeting_removed', `Meeting “${m.title}” removed.`);
  res.json({ ok: true });
});

export default router;
