// Conversational AI assistant panel. Answers questions grounded in the live
// database (counts, lists, meetings). Uses the LLM when configured for
// phrasing/fallback, otherwise deterministic intent matching. Never invents data.
import { all, get } from '../db.js';
import { llmAvailable, llmChat } from './llm.js';
import { classifyConversation, draftReply } from './classify.js';

async function ownedClientIds(user) {
  if (user.role === 'client') {
    const row = await get('SELECT id FROM clients WHERE user_id = ?', user.id);
    return row ? [row.id] : [];
  }
  return (await all('SELECT id FROM clients WHERE assistant_id = ?', user.id)).map((r) => r.id);
}

async function scopeFilter(user, clientId) {
  // Returns { clause, params } constraining client_id for this user.
  const owned = await ownedClientIds(user);
  if (clientId && owned.includes(clientId)) return { clause: 'client_id = ?', params: [clientId] };
  if (owned.length === 0) return { clause: '1 = 0', params: [] };
  return { clause: `client_id IN (${owned.map(() => '?').join(',')})`, params: owned };
}

async function snapshot(user, clientId) {
  const { clause, params } = await scopeFilter(user, clientId);
  const open = `status = 'open' AND ${clause}`;
  const attention = await all(
    `SELECT id, subject, classification, confidence, importance FROM conversations
     WHERE ${open} AND (classification = 'client' OR needs_review = 1 OR approval_status = 'pending')
     ORDER BY importance = 'high' DESC, last_activity_at DESC LIMIT 8`, ...params);
  const unread = await all(
    `SELECT id, subject, classification FROM conversations WHERE ${open} AND is_read = 0 ORDER BY last_activity_at DESC LIMIT 8`, ...params);
  const unreadCount = (await get(`SELECT COUNT(*) AS n FROM conversations WHERE ${open} AND is_read = 0`, ...params)).n;
  const waiting = await all(
    `SELECT id, subject, waiting_since FROM conversations WHERE ${open} AND waiting_since IS NOT NULL ORDER BY waiting_since ASC LIMIT 8`, ...params);
  const important = await all(
    `SELECT id, subject FROM conversations WHERE ${open} AND (importance = 'high' OR is_starred = 1) ORDER BY last_activity_at DESC LIMIT 8`, ...params);
  const since = new Date(); since.setDate(since.getDate() - 1);
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const meetings = await all(
    `SELECT title, start_at, location FROM meetings WHERE ${clause} AND start_at >= ? AND start_at <= ? ORDER BY start_at ASC LIMIT 6`,
    ...params, since.toISOString(), weekEnd.toISOString());
  const counts = await get(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN classification='assistant' THEN 1 ELSE 0 END) AS a,
      SUM(CASE WHEN classification='client' THEN 1 ELSE 0 END) AS c,
      SUM(CASE WHEN classification='none' THEN 1 ELSE 0 END) AS n
    FROM conversations WHERE ${open}`, ...params);
  return { attention, unread, unreadCount, waiting, important, meetings, counts };
}

const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const bullet = (rows, fn) => (rows.length ? rows.map((r) => `• ${fn(r)}`).join('\n') : '• Nothing here — you’re clear.');

function deterministicAnswer(q, snap) {
  if (/(attention|need.*(me|you|reply)|action required|priority|urgent)/i.test(q)) {
    return `Here’s what needs attention right now:\n\n${bullet(snap.attention, (r) => `“${r.subject}” — ${r.classification === 'client' ? 'client decision' : r.approval_status === 'pending' ? 'approval pending' : 'low confidence, review it'}${r.importance === 'high' ? ' · high priority' : ''}`)}\n\n${snap.important.length} open thread(s) are flagged important overall.`;
  }
  if (/unread/i.test(q)) {
    return `You have ${snap.unreadCount} unread open conversation(s).\n\n${bullet(snap.unread, (r) => `“${r.subject}” — ${r.classification === 'assistant' ? 'assistant to reply' : r.classification === 'client' ? 'client to reply' : 'no reply needed'}`)}`;
  }
  if (/(waiting|follow[- ]?up|no response|pending resp)/i.test(q)) {
    return `These conversations are still waiting for a response:\n\n${bullet(snap.waiting, (r) => `“${r.subject}” — sent ${fmtDate(r.waiting_since)}`)}\n\nConsider a polite nudge for anything older than 3 days.`;
  }
  if (/(meeting|appointment|scheduled|calendar)/i.test(q)) {
    return `Meetings in the next 7 days:\n\n${bullet(snap.meetings, (m) => `${fmtDate(m.start_at)} — ${m.title}${m.location ? ` @ ${m.location}` : ''}`)}`;
  }
  if (/important|today|starred/i.test(q)) {
    return `Flagged as important / starred:\n\n${bullet(snap.important, (r) => `“${r.subject}”`)}`;
  }
  if (/summar|overview|brief|inbox/i.test(q)) {
    const c = snap.counts;
    return `Inbox overview — ${c.total || 0} open thread(s):\n• Assistant to reply: ${c.a || 0}\n• Client to reply: ${c.c || 0}\n• No reply needed: ${c.n || 0}\n• Unread: ${snap.unreadCount}\n• Waiting on others: ${snap.waiting.length}\n• Meetings this week: ${snap.meetings.length}\n\nAsk me “which emails need my attention?” for the priority list.`;
  }
  if (/help|what can you/i.test(q)) {
    return `I can answer questions from your live inbox, for example:\n• Which emails need my attention?\n• Summarize my unread emails\n• Which conversations are waiting for a response?\n• What meetings are scheduled this week?\n• Why does this email require client attention? (open it first, then ask)\n• Draft a professional reply (open a conversation, then ask)`;
  }
  return null;
}

export async function answerQuestion(question, { user, clientId = null, conversationId = null }) {
  const snap = await snapshot(user, clientId);

  // Conversation-scoped questions
  if (conversationId) {
    const convo = await get('SELECT * FROM conversations WHERE id = ?', conversationId);
    if (convo) {
      const messages = await all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', conversationId);
      if (/why/i.test(question)) {
        return { engine: 'data', answer: `AI classification: ${convo.classification === 'assistant' ? 'Assistant to reply' : convo.classification === 'client' ? 'Client to reply' : 'No reply needed'} (confidence ${Math.round(convo.confidence * 100)}%).\n\nWhy: ${convo.reason || 'No explanation recorded.'}\n\nSuggested next action: ${convo.suggested_action || 'Review manually.'}${convo.needs_review ? '\n\nNote: confidence is low, so this was flagged for human review.' : ''}` };
      }
      if (/draft|reply/i.test(question)) {
        const client = await get('SELECT * FROM clients WHERE id = ?', convo.client_id);
        const out = await draftReply({ subject: convo.subject, messages, clientName: client?.name || 'the client', assistantName: user.name });
        return { engine: out.engine, answer: `Here’s a draft you can review and edit (never sent automatically):\n\n${out.text}` };
      }
      if (/reclassif|re-check|reconsider/i.test(question)) {
        const client = await get('SELECT * FROM clients WHERE id = ?', convo.client_id);
        const out = await classifyConversation({ subject: convo.subject, messages, clientName: client?.name || 'the client' });
        return { engine: out.engine, answer: `Re-checked against the latest history → ${out.classification === 'assistant' ? 'Assistant to reply' : out.classification === 'client' ? 'Client to reply' : 'No reply needed'} (${Math.round(out.confidence * 100)}%).\n${out.reason}\n\nUse the “Re-analyze” button in the AI panel to apply this.` };
      }
    }
  }

  const direct = deterministicAnswer(question, snap);
  if (direct) return { engine: 'data', answer: direct };

  if (llmAvailable()) {
    const content = await llmChat([
      { role: 'system', content: 'You are Relay, an email operations assistant. Answer ONLY from the JSON snapshot provided (it holds live inbox facts). Be concise, use short bullet lists, plain text. If the answer is not in the snapshot, say what you can see instead.' },
      { role: 'user', content: `Question: ${question}\n\nInbox snapshot: ${JSON.stringify(snap).slice(0, 6000)}` },
    ], { temperature: 0.3 });
    if (content) return { engine: 'llm', answer: content.trim() };
  }

  // No LLM and no intent match: give the digest instead of an empty answer.
  const c = snap.counts;
  return { engine: 'data', answer: `I’m running without an LLM key right now, so I answer from live inbox data.\n\nSnapshot — open: ${c.total || 0} · assistant: ${c.a || 0} · client: ${c.c || 0} · unread: ${snap.unreadCount} · waiting: ${snap.waiting.length} · meetings (7d): ${snap.meetings.length}.\n\nTry: “Which emails need my attention?”, “Summarize my unread emails”, “What meetings are scheduled this week?”` };
}
