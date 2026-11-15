// Classification orchestrator: LLM first (when configured), deterministic
// fallback otherwise — or on ANY LLM failure. The API shape is identical either
// way, so the rest of the app never knows or cares which engine ran.
import { llmAvailable, llmChat, parseJsonObject } from './llm.js';
import { fallbackClassify, fallbackDraftReply } from './fallback.js';

function transcript(messages, maxBody = 1400) {
  return messages
    .map((m) => `${m.direction === 'outbound' ? 'ME' : m.sender_name} <${m.sender_email}> — ${m.created_at}\n${m.body.slice(0, maxBody)}`)
    .join('\n\n---\n\n');
}

const CLASSIFY_SYSTEM = `You are the triage engine for an executive personal assistant who manages a client's inbox.
For each email conversation decide WHO should respond:
- "assistant": the assistant can handle it (scheduling, logistics, documents, routine coordination).
- "client": the CLIENT personally must decide or approve (business judgement, money, legal, hiring, strategy, final sign-off).
- "none": automated mail, newsletters, receipts — no human reply needed.
Set needs_review=true when confidence is below 0.6.
Respond with ONLY a JSON object with keys:
classification ("assistant"|"client"|"none"), confidence (number 0-1), summary (max 2 sentences, plain text),
reason (one sentence citing the signals you used), suggested_action (one sentence, imperative),
needs_review (boolean), importance ("high"|"normal"|"low"), approval_requested (boolean), meeting_candidate (boolean).`;

export async function classifyConversation({ subject, messages, clientName }) {
  if (llmAvailable()) {
    const content = await llmChat([
      { role: 'system', content: CLASSIFY_SYSTEM },
      { role: 'user', content: `Client: ${clientName}\nSubject: ${subject}\n\nConversation:\n${transcript(messages)}` },
    ], { json: true });
    const parsed = parseJsonObject(content);
    if (parsed && ['assistant', 'client', 'none'].includes(parsed.classification)) {
      const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
      return {
        classification: parsed.classification,
        confidence: Number(confidence.toFixed(2)),
        summary: String(parsed.summary || '').slice(0, 600),
        reason: String(parsed.reason || '').slice(0, 400),
        suggested_action: String(parsed.suggested_action || '').slice(0, 400),
        needs_review: Boolean(parsed.needs_review) || confidence < 0.6,
        importance: ['high', 'normal', 'low'].includes(parsed.importance) ? parsed.importance : 'normal',
        approval_requested: Boolean(parsed.approval_requested),
        meeting_candidate: Boolean(parsed.meeting_candidate),
        engine: 'llm',
      };
    }
    // LLM answered garbage → fall through to fallback (never crash)
  }
  return fallbackClassify({ subject, messages, senderName: messages?.[0]?.sender_name || '' });
}

export async function draftReply({ subject, messages, clientName, assistantName }) {
  if (llmAvailable()) {
    const content = await llmChat([
      { role: 'system', content: `You draft concise, warm, professional email replies written on behalf of ${clientName} by their assistant ${assistantName}. Never invent facts, dates, prices or commitments — leave a clear placeholder like [confirm date] when unknown. Plain text only, no subject line. Sign off as "${assistantName}, Personal Assistant to ${clientName}".` },
      { role: 'user', content: `Subject: ${subject}\n\nConversation:\n${transcript(messages, 900)}` },
    ], { temperature: 0.4 });
    if (content && content.trim().length > 20) return { text: content.trim(), engine: 'llm' };
  }
  return { text: fallbackDraftReply({ subject, messages, clientName, assistantName }), engine: 'fallback' };
}
