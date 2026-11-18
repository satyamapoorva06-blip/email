// Gmail → Relay synchronization. Real data only: no thread is fabricated;
// anything Gmail returns is classified by the app's AI engine like any other mail.
import { all, get, run, nowIso, logActivity, ensureGmailColumns } from '../db.js';
import { gmailApi, refreshAccessToken, parseThread, threadLastMessageId, buildRawReply } from './google.js';
import { encryptToken, decryptToken } from './crypto.js';
import { classifyConversation } from '../ai/classify.js';

export async function getGmailAccount(clientId) {
  await ensureGmailColumns();
  return get(`SELECT * FROM connected_accounts WHERE client_id = ? AND provider = 'gmail' AND mode = 'real' ORDER BY id DESC LIMIT 1`, clientId);
}

export async function getFreshAccessToken(account) {
  let access = null; let refresh = null;
  try {
    access = decryptToken(account.access_token_enc);
    refresh = decryptToken(account.refresh_token_enc);
  } catch (err) {
    const e = new Error(err.message); e.code = 'token_corrupt'; throw e;
  }
  const expiry = account.token_expiry ? Date.parse(account.token_expiry) : 0;
  if (access && expiry > Date.now() + 60_000) return access;
  if (!refresh) {
    const e = new Error('No refresh token stored — disconnect and reconnect Gmail.');
    e.code = 'no_refresh_token'; throw e;
  }
  const tok = await refreshAccessToken(refresh);
  const newAccess = tok.access_token;
  const newExpiry = new Date(Date.now() + Number(tok.expires_in || 3600) * 1000).toISOString();
  await run('UPDATE connected_accounts SET access_token_enc = ?, token_expiry = ?, status = ? WHERE id = ?',
    encryptToken(newAccess), newExpiry, 'connected', account.id);
  return newAccess;
}

const dirOf = (email, own) => (String(email).toLowerCase() === String(own).toLowerCase() ? 'outbound' : 'inbound');

export async function syncGmailForClient(clientId, { maxResults = 15 } = {}) {
  const account = await getGmailAccount(clientId);
  if (!account) return { ok: false, code: 'not_connected' };
  const access = await getFreshAccessToken(account);
  const own = String(account.email).toLowerCase();
  const client = await get('SELECT * FROM clients WHERE id = ?', clientId);
  const list = await gmailApi.listThreads(access, maxResults);
  const threadIds = (list.threads || []).map((t) => t.id);

  let imported = 0; let updated = 0; let skipped = 0;
  const errors = [];

  for (const tid of threadIds) {
    try {
      const existing = await get('SELECT id, is_read FROM conversations WHERE client_id = ? AND external_id = ?', clientId, tid);
      const thread = await gmailApi.getThread(access, tid);
      const parsed = parseThread(thread);
      if (parsed.messages.length === 0) { skipped++; continue; }

      const normalized = parsed.messages.map((m) => ({ ...m, direction: dirOf(m.from_email, own) }));
      const last = normalized[normalized.length - 1];
      const anyUnread = normalized.some((m) => m.unread);
      const lastActivity = last.date;

      if (existing) {
        let changed = 0;
        for (const m of normalized) {
          const seen = await get('SELECT id FROM messages WHERE conversation_id = ? AND external_id = ?', existing.id, m.external_id);
          if (seen) continue;
          await run('INSERT INTO messages (conversation_id, sender_name, sender_email, body, direction, external_id, created_at) VALUES (?,?,?,?,?,?,?)',
            existing.id, m.from_name, m.from_email, m.body, m.direction, m.external_id, m.date);
          changed++;
        }
        if (changed) {
          await run('UPDATE conversations SET last_activity_at = ?, is_read = ? WHERE id = ?', lastActivity, anyUnread ? 0 : 1, existing.id);
          updated++;
        } else skipped++;
        continue;
      }

      const analysis = await classifyConversation({
        subject: parsed.subject,
        messages: normalized.map((m) => ({ direction: m.direction, sender_name: m.from_name, sender_email: m.from_email, body: m.body, created_at: m.date })),
        clientName: client?.name || 'the client',
      });

      const out = await run(`INSERT INTO conversations
        (client_id, subject, classification, confidence, summary, reason, suggested_action, needs_review,
         status, is_read, is_starred, importance, approval_status, approval_note, waiting_since, external_id, last_activity_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        clientId, parsed.subject.slice(0, 300),
        analysis.classification, analysis.confidence, analysis.summary, analysis.reason, analysis.suggested_action,
        analysis.needs_review ? 1 : 0,
        'open', anyUnread ? 0 : 1, 0, analysis.importance,
        analysis.approval_requested ? 'pending' : 'none', null, null,
        tid, lastActivity, lastActivity);
      const convoId = Number(out.lastInsertRowid);
      for (const m of normalized) {
        await run('INSERT INTO messages (conversation_id, sender_name, sender_email, body, direction, external_id, created_at) VALUES (?,?,?,?,?,?,?)',
          convoId, m.from_name, m.from_email, m.body, m.direction, m.external_id, m.date);
      }
      await logActivity(clientId, 'ai', 'classified',
        `Gmail sync: “${parsed.subject}” → ${analysis.classification === 'client' ? 'Client to reply' : analysis.classification === 'assistant' ? 'Assistant to reply' : 'No reply needed'} (${Math.round(analysis.confidence * 100)}%, ${analysis.engine} engine).`);
      imported++;
    } catch (err) {
      errors.push({ threadId: tid, error: err.message });
    }
  }

  await run('UPDATE connected_accounts SET last_synced_at = ?, status = ? WHERE id = ?', nowIso(), 'connected', account.id);
  return { ok: true, imported, updated, skipped, errors: errors.slice(0, 5) };
}

/** Send an explicitly-approved reply as the connected Gmail user. Throws on failure. */
export async function sendGmailReply({ clientId, threadExternalId, to, subject, body, ownEmail }) {
  const account = await getGmailAccount(clientId);
  if (!account) return { sent: false, code: 'not_connected' };
  const access = await getFreshAccessToken(account);
  let references = null;
  try {
    const thread = await gmailApi.getThread(access, threadExternalId);
    references = threadLastMessageId(thread);
  } catch (err) {
    console.error('[gmail] could not fetch thread for threading headers:', err.message);
  }
  const raw = buildRawReply({ from: ownEmail || account.email, to, subject, body, references });
  const sent = await gmailApi.sendMessage(access, { raw });
  return { sent: true, gmailMessageId: sent.id || null };
}
