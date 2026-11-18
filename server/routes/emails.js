// Email/conversation routes (assistant workspace + shared read helpers).
import { Router } from 'express';
import { sendGmailReply, getGmailAccount, getFreshAccessToken } from '../gmail/sync.js';
import { gmailApi } from '../gmail/google.js';
import { all, get, run, nowIso, logActivity } from '../db.js';
import { authRequired, assistantOnly, scopeClause } from '../auth.js';
import { classifyConversation, draftReply } from '../ai/classify.js';
import { llmAvailable, llmChat, parseJsonObject } from '../ai/llm.js';

const router = Router();
router.param('id', (_req, res, next, value) => {
  if (!/^\d+$/.test(String(value))) return res.status(404).json({ error: 'Not found.' });
  next();
});
router.use(authRequired);

const CLASSIFICATIONS = ['assistant', 'client', 'none'];

// Hydrate a conversation row with list-view fields (sender, preview, counts).
async function hydrate(row) {
  const lastMsg = await get('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', row.id);
  const lastInbound = await get(`SELECT * FROM messages WHERE conversation_id = ? AND direction = 'inbound' ORDER BY created_at DESC, id DESC LIMIT 1`, row.id);
  const client = await get('SELECT id, name, company, email, avatar_color FROM clients WHERE id = ?', row.client_id);
  const attachments = (await get('SELECT COUNT(*) AS n FROM attachments a JOIN messages m ON m.id = a.message_id WHERE m.conversation_id = ?', row.id)).n;
  return {
    ...row,
    is_read: !!row.is_read,
    is_starred: !!row.is_starred,
    needs_review: !!row.needs_review,
    client_name: client?.name,
    client_company: client?.company,
    client_color: client?.avatar_color,
    sender_name: lastInbound?.sender_name || lastMsg?.sender_name || 'Unknown',
    sender_email: lastInbound?.sender_email || lastMsg?.sender_email || '',
    preview: (lastMsg?.body || '').replace(/\s+/g, ' ').slice(0, 140),
    last_direction: lastMsg?.direction || 'inbound',
    message_count: (await get('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', row.id)).n,
    attachment_count: attachments,
  };
}

function visibleIdsClause(req) { return scopeClause(req, 'c.client_id'); }

// GET /api/emails?filter=&search=&sort=&clientId=&status=
router.get('/', assistantOnly, async (req, res) => {
  const { filter = 'all', search = '', sort = 'newest', clientId } = req.query;
  const scope = scopeClause(req, 'c.client_id');
  const where = [scope.clause];
  const params = [...scope.params];

  switch (filter) {
    case 'assistant':
      where.push(`c.classification = 'assistant' AND c.status = 'open'`); break;
    case 'client':
      where.push(`c.classification = 'client' AND c.status = 'open'`); break;
    case 'none':
      where.push(`c.classification = 'none' AND c.status = 'open'`); break;
    case 'action':
      where.push(`c.status = 'open' AND (c.classification = 'client' OR c.needs_review = 1 OR c.approval_status = 'pending')`); break;
    case 'waiting':
      where.push(`c.status = 'open' AND c.waiting_since IS NOT NULL`); break;
    case 'important':
      where.push(`c.status = 'open' AND (c.importance = 'high' OR c.is_starred = 1)`); break;
    case 'archived':
      where.push(`c.status IN ('archived','completed')`); break;
    case 'all':
    default:
      where.push(`c.status = 'open'`);
  }

  if (search.trim()) {
    where.push(`(c.subject LIKE ? OR c.summary LIKE ? OR EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND (m.body LIKE ? OR m.sender_name LIKE ? OR m.sender_email LIKE ?)))`);
    const q = `%${search.trim()}%`;
    params.push(q, q, q, q, q);
  }

  const order = {
    newest: 'c.last_activity_at DESC',
    oldest: 'c.last_activity_at ASC',
    important: `c.importance = 'high' DESC, c.last_activity_at DESC`,
    unread: 'c.is_read ASC, c.last_activity_at DESC',
  }[sort] || 'c.last_activity_at DESC';

  const rows = await all(`SELECT c.* FROM conversations c WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 300`, ...params);
  res.json({ emails: await Promise.all(rows.map(hydrate)), engine: llmAvailable() ? 'llm' : 'fallback' });
});

// GET /api/emails/:id — full conversation + AI analysis
router.get('/:id', assistantOnly, async (req, res) => {
  const convo = await get('SELECT c.* FROM conversations c WHERE c.id = ?', req.params.id);
  if (!convo || !req.clientIds.includes(convo.client_id)) return res.status(404).json({ error: 'Conversation not found.' });
  const messages = await all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC', convo.id);
  const ids = messages.map((m) => m.id);
  const attachments = ids.length
    ? await all(`SELECT * FROM attachments WHERE message_id IN (${ids.map(() => '?').join(',')})`, ...ids)
    : [];
  const withAttachments = messages.map((m) => ({ ...m, attachments: attachments.filter((a) => a.message_id === m.id) }));
  res.json({ conversation: await hydrate(convo), messages: withAttachments, client: await get('SELECT id, name, company, email, avatar_color, role_title FROM clients WHERE id = ?', convo.client_id) });
});

// --- Per-conversation actions ------------------------------------------
// Best-effort Gmail label sync for real threads (mark read/archive). Failures are logged, never fatal.
async function gmailLabelsBestEffort(convo, body) {
  if (!convo.external_id) return;
  try {
    const account = await getGmailAccount(convo.client_id);
    if (!account) return;
    const access = await getFreshAccessToken(account);
    await gmailApi.modifyThread(access, convo.external_id, body);
  } catch (err) {
    console.error('[gmail] label sync failed:', err.message);
  }
}

async function ownedConvo(req, res) {
  const convo = await get('SELECT * FROM conversations WHERE id = ?', req.params.id);
  if (!convo || !req.clientIds.includes(convo.client_id)) { res.status(404).json({ error: 'Conversation not found.' }); return null; }
  return convo;
}

router.post('/:id/read', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const markRead = req.body?.read !== false;
  await run('UPDATE conversations SET is_read = ? WHERE id = ?', markRead ? 1 : 0, convo.id);
  await gmailLabelsBestEffort(convo, markRead ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] });
  res.json({ ok: true });
});

router.post('/:id/star', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  await run('UPDATE conversations SET is_starred = ? WHERE id = ?', req.body?.starred === false ? 0 : 1, convo.id);
  res.json({ ok: true });
});

router.post('/:id/archive', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const unarchive = req.body?.undo === true;
  await run('UPDATE conversations SET status = ? WHERE id = ?', unarchive ? 'open' : 'archived', convo.id);
  await gmailLabelsBestEffort(convo, unarchive ? { addLabelIds: ['INBOX'] } : { removeLabelIds: ['INBOX'] });
  await logActivity(convo.client_id, 'assistant', unarchive ? 'unarchived' : 'archived', `“${convo.subject}” ${unarchive ? 'moved back to inbox' : 'archived'}.`);
  res.json({ ok: true });
});

router.post('/:id/complete', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  await run(`UPDATE conversations SET status = ? WHERE id = ?`, 'completed', convo.id);
  await logActivity(convo.client_id, 'assistant', 'completed', `“${convo.subject}” marked as completed.`);
  res.json({ ok: true });
});

router.delete('/:id', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  await logActivity(convo.client_id, 'assistant', 'deleted', `“${convo.subject}” was deleted.`);
  await run('DELETE FROM conversations WHERE id = ?', convo.id);
  res.json({ ok: true });
});

// Bulk operations: { ids: number[], action: read|unread|archive|delete|star|unstar|complete }
router.post('/bulk', assistantOnly, async (req, res) => {
  const { ids = [], action } = req.body || {};
  const clean = [...new Set(ids.map(Number))].filter((n) => Number.isInteger(n));
  if (!clean.length) return res.status(400).json({ error: 'No conversations selected.' });
  const allowed = (await all(`SELECT id, client_id, subject FROM conversations WHERE id IN (${clean.map(() => '?').join(',')})`, ...clean))
    .filter((r) => req.clientIds.includes(r.client_id));
  if (!allowed.length) return res.status(404).json({ error: 'No matching conversations.' });
  const idList = allowed.map(() => '?').join(',');
  const params = allowed.map((r) => r.id);
  switch (action) {
    case 'read': await run(`UPDATE conversations SET is_read = 1 WHERE id IN (${idList})`, ...params); break;
    case 'unread': await run(`UPDATE conversations SET is_read = 0 WHERE id IN (${idList})`, ...params); break;
    case 'star': await run(`UPDATE conversations SET is_starred = 1 WHERE id IN (${idList})`, ...params); break;
    case 'unstar': await run(`UPDATE conversations SET is_starred = 0 WHERE id IN (${idList})`, ...params); break;
    case 'archive': await run(`UPDATE conversations SET status = 'archived' WHERE id IN (${idList})`, ...params); break;
    case 'complete': await run(`UPDATE conversations SET status = 'completed' WHERE id IN (${idList})`, ...params); break;
    case 'delete': await run(`DELETE FROM conversations WHERE id IN (${idList})`, ...params); break;
    default: return res.status(400).json({ error: 'Unknown bulk action.' });
  }
  for (const r of allowed) await logActivity(r.client_id, 'assistant', `bulk_${action}`, `“${r.subject}”`);
  res.json({ ok: true, affected: allowed.length });
});

// Manual override of the AI classification
router.put('/:id/classification', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const { classification } = req.body || {};
  if (!CLASSIFICATIONS.includes(classification)) return res.status(400).json({ error: 'Invalid classification.' });
  await run(`UPDATE conversations SET classification = ?, needs_review = 0, confidence = 1, reason = 'Manually set by the assistant.', last_activity_at = ? WHERE id = ?`, classification, nowIso(), convo.id);
  await logActivity(convo.client_id, 'assistant', 'reclassified', `“${convo.subject}” manually set to ${classification === 'assistant' ? 'Assistant to reply' : classification === 'client' ? 'Client to reply' : 'No reply needed'}.`);
  res.json({ ok: true });
});

// Re-run the AI classifier over the current history
router.post('/:id/reanalyze', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const client = await get('SELECT name FROM clients WHERE id = ?', convo.client_id);
  const messages = await all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', convo.id);
  const result = await classifyConversation({ subject: convo.subject, messages, clientName: client?.name || 'the client' });
  await run(`UPDATE conversations
       SET classification = ?, confidence = ?, summary = ?, reason = ?, suggested_action = ?, needs_review = ?, importance = CASE WHEN importance = 'low' THEN ? ELSE importance END,
           approval_status = CASE WHEN ? = 1 AND approval_status = 'none' THEN 'pending' ELSE approval_status END,
           last_activity_at = ?
       WHERE id = ?`,
    result.classification, result.confidence, result.summary, result.reason, result.suggested_action,
    result.needs_review ? 1 : 0, result.importance, result.approval_requested ? 1 : 0, nowIso(), convo.id);
  await logActivity(convo.client_id, 'ai', 'reclassified', `AI re-analyzed “${convo.subject}” → ${result.classification === 'assistant' ? 'Assistant to reply' : result.classification === 'client' ? 'Client to reply' : 'No reply needed'} (${Math.round(result.confidence * 100)}%).`);
  res.json({ ok: true, result });
});

// AI reply draft (never auto-sent — returned for the assistant to review)
router.post('/:id/generate-reply', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const client = await get('SELECT * FROM clients WHERE id = ?', convo.client_id);
  const messages = await all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', convo.id);
  const draft = await draftReply({ subject: convo.subject, messages, clientName: client?.name || 'the client', assistantName: req.user.name });
  res.json(draft);
});

// Send a reply (simulated send through the connected mailbox) and record it
router.post('/:id/reply', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const body = String(req.body?.body || '').trim();
  if (body.length < 2) return res.status(400).json({ error: 'Write a message first.' });
  if (body.length > 20000) return res.status(400).json({ error: 'Message is too long.' });
  const client = await get('SELECT * FROM clients WHERE id = ?', convo.client_id);
  const account = await get(`SELECT email, mode FROM connected_accounts WHERE client_id = ? ORDER BY CASE WHEN mode = 'real' THEN 0 ELSE 1 END, id ASC LIMIT 1`, convo.client_id);
  const ts = nowIso();
  const insert = await run(`INSERT INTO messages (conversation_id, sender_name, sender_email, body, direction, created_at) VALUES (?,?,?,?,?,?)`,
    convo.id, `${req.user.name} · Assistant to ${client?.name || 'client'}`, account?.email || client?.email || req.user.email, body, 'outbound', ts);
  const messageId = Number(insert.lastInsertRowid);
  await run(`UPDATE conversations SET is_read = 1, waiting_since = ?, last_activity_at = ? WHERE id = ?`, ts, ts, convo.id);

  // Real Gmail thread → the explicitly-clicked Send is the approval gate; deliver via Gmail.
  if (convo.external_id) {
    try {
      const inbound = await all(`SELECT sender_email FROM messages WHERE conversation_id = ? AND direction = 'inbound' ORDER BY created_at DESC LIMIT 1`, convo.id);
      const to = inbound[0]?.sender_email;
      if (!to) throw new Error('No inbound recipient found in this thread.');
      const result = await sendGmailReply({ clientId: convo.client_id, threadExternalId: convo.external_id, to, subject: convo.subject, body, ownEmail: account?.email });
      if (result.gmailMessageId) await run('UPDATE messages SET external_id = ? WHERE id = ?', result.gmailMessageId, messageId);
      await logActivity(convo.client_id, 'assistant', 'sent_reply', `${req.user.name} sent a reply via Gmail on ${client?.name || 'the client'}’s behalf in “${convo.subject}”.`);
      return res.json({ ok: true, delivered: 'gmail' });
    } catch (err) {
      // The draft IS saved in Relay; say plainly that delivery failed — never fake it.
      await logActivity(convo.client_id, 'assistant', 'gmail_send_failed', `Reply to “${convo.subject}” saved in Relay but Gmail delivery failed: ${err.message}`);
      return res.status(502).json({ error: `Reply saved in Relay, but sending via Gmail failed: ${err.message}`, saved: true });
    }
  }
  await logActivity(convo.client_id, 'assistant', 'sent_reply', `${req.user.name} sent a reply on ${client?.name || 'the client'}’s behalf in “${convo.subject}” (simulated send).`);
  res.json({ ok: true, delivered: 'simulated' });
});

// Try to extract a meeting from the conversation (LLM when available, regex otherwise)
router.post('/:id/extract-meeting', assistantOnly, async (req, res) => {
  const convo = await ownedConvo(req, res); if (!convo) return;
  const messages = await all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', convo.id);
  const text = messages.map((m) => `${m.sender_name}: ${m.body}`).join('\n');

  let candidate = null;
  if (llmAvailable()) {
    const content = await llmChat([
      { role: 'system', content: 'Extract the single most likely upcoming meeting from this email thread. Respond ONLY with JSON: {"found": boolean, "title": string, "start_at": ISO-8601 or null, "end_at": ISO-8601 or null, "location": string, "attendees": string}. Use the current year 2026 if missing.' },
      { role: 'user', content: `Today is ${new Date().toISOString().slice(0, 10)}.\n\n${text.slice(0, 4000)}` },
    ], { json: true });
    const parsed = parseJsonObject(content);
    if (parsed?.found && parsed.start_at && !Number.isNaN(Date.parse(parsed.start_at))) {
      candidate = {
        title: String(parsed.title || convo.subject).slice(0, 160),
        start_at: new Date(parsed.start_at).toISOString(),
        end_at: parsed.end_at && !Number.isNaN(Date.parse(parsed.end_at)) ? new Date(parsed.end_at).toISOString() : new Date(Date.parse(parsed.start_at) + 45 * 60000).toISOString(),
        location: String(parsed.location || '').slice(0, 160),
        attendees: String(parsed.attendees || '').slice(0, 300),
      };
    }
  }
  if (!candidate) {
    // Deterministic fallback: find a time + date hint in the text.
    const timeMatch = text.match(/\b(\d{1,2})(:\d{2})?\s?(am|pm)\b/i);
    let dayOffset = 1;
    if (/\btoday\b/i.test(text)) dayOffset = 0; else if (/\btomorrow\b/i.test(text)) dayOffset = 1; else if (/\bnext week\b/i.test(text)) dayOffset = 7;
    if (timeMatch) {
      let hour = Number(timeMatch[1]);
      const minute = Number((timeMatch[2] || ':00').slice(1));
      const pm = /pm/i.test(timeMatch[3]);
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
      const start = new Date(); start.setDate(start.getDate() + dayOffset); start.setHours(hour, minute, 0, 0);
      candidate = { title: convo.subject.slice(0, 160), start_at: start.toISOString(), end_at: new Date(start.getTime() + 45 * 60000).toISOString(), location: '', attendees: '' };
    }
  }
  if (!candidate) return res.json({ created: false, reason: 'No date/time found in this thread.' });
  const dupe = await get('SELECT id FROM meetings WHERE client_id = ? AND conversation_id = ?', convo.client_id, convo.id);
  if (dupe) return res.json({ created: false, reason: 'A meeting for this thread already exists.', meetingId: dupe.id });
  const out = await run('INSERT INTO meetings (client_id, conversation_id, title, start_at, end_at, location, attendees, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    convo.client_id, convo.id, candidate.title, candidate.start_at, candidate.end_at, candidate.location, candidate.attendees, 'extracted', nowIso());
  await logActivity(convo.client_id, 'ai', 'meeting_extracted', `Extracted “${candidate.title}” from “${convo.subject}”.`);
  res.json({ created: true, meetingId: Number(out.lastInsertRowid), ...candidate });
});

export default router;
