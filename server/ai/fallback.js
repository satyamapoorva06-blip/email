// Rule-based fallback classification engine.
// This is NOT presented as "AI" — it is a transparent, deterministic
// keyword/pattern scorer used when no LLM API key is configured or the LLM is
// unreachable. Matched signals are surfaced in the explanation so users can see
// exactly why a decision was made.

const DATE_OR_TIME = /\b(today|tomorrow|tonight|next (week|monday|tuesday|wednesday|thursday|friday)|\d{1,2}(:\d{2})?\s?(am|pm)\b|\d{4}-\d{2}-\d{2})\b/i;
const URGENT = /\b(urgent|urgently|asap|a\.s\.a\.p|immediately|right away|by eod|end of day|by end of|deadline|time-sensitive|critical|today)\b/i;

// Signals that the CLIENT personally must decide/approve.
const CLIENT_SIGNALS = [
  { re: /\bapprov(al|e|ing)\b/i, label: 'approval language' },
  { re: /\bsign(ature|ing)?\b(?!ed)/i, label: 'signature request' },
  { re: /\bterm sheet\b/i, label: 'term sheet' },
  { re: /\b(proceed|go ahead) with\b/i, label: 'proceed/go-ahead decision' },
  { re: /\byour (decision|call|approval|sign-off|go-ahead)\b/i, label: 'decision explicitly requested from client' },
  { re: /\bconfirm whether\b/i, label: 'decision confirmation requested' },
  { re: /\b(equity|compensation|vesting|salary|offer letter)\b/i, label: 'compensation matter' },
  { re: /\b(budget|spend|invoice (approval|over))\b/i, label: 'budget/spend approval' },
  { re: /\b(partnership|acquisition|merger|invest(ment)?|term sheet)\b.*\?|\?\s*$/i, label: 'open business question' },
  { re: /\b(vendor|candidate|finalist)\s+(selection|decision|call)\b/i, label: 'selection decision' },
  { re: /\bboard\b.*\b(approve|sign|review|decide)\b/i, label: 'board-level decision' },
  { re: /\b(final (call|say|decision)|call the shots)\b/i, label: 'final decision language' },
  { re: /\b(legal|counsel|contract)\b.*\b(approv|sign|review)\b/i, label: 'legal approval' },
  { re: /\b(counter|revised)\s+(offer|terms|proposal)\b.*\b(ok|okay|approv|proceed|good)\b/i, label: 'negotiation approval' },
];

// Signals the ASSISTANT can handle (logistics, scheduling, coordination).
const ASSISTANT_SIGNALS = [
  { re: /\b(schedule|reschedule|appointment|calendar|availability|slot|book(ing)?|propose a time)\b/i, label: 'scheduling' },
  { re: /\b(call|meeting)\s+(at|on|for)\s/i, label: 'meeting logistics' },
  { re: /\b(itinerary|flight|hotel|travel|pickup|transfer|check-in)\b/i, label: 'travel logistics' },
  { re: /\b(catering|reservation|venue|seating)\b/i, label: 'event logistics' },
  { re: /\b(send|forward|share)\b.*\b(deck|document|file|pdf|itinerary|report|invoice|slides)\b/i, label: 'document request' },
  { re: /\b(confirm receipt|received your|did you get)\b/i, label: 'receipt confirmation' },
  { re: /\b(invoice|receipt|payment)\b.*\b(attach|attached|enclos|attached)\b/i, label: 'invoice/document handling' },
  { re: /\b(eta|tracking|delivery|shipment|courier)\b/i, label: 'delivery tracking' },
  { re: /\b(update|sync|check-in)\s+(call|meeting)\b/i, label: 'routine sync' },
  { re: /\b(reminder|follow[- ]up)\b/i, label: 'reminder' },
  { re: /\b(draft|prepare|pull together|compile)\b/i, label: 'preparation request' },
  { re: /\b(on behalf of|assistant|your office|your team)\b/i, label: 'addressed to the assistant/office' },
];

// Signals of automated/no-reply mail.
const NONE_SIGNALS = [
  { re: /\bunsubscribe\b/i, label: 'newsletter (unsubscribe link)' },
  { re: /\b(view in browser|read online)\b/i, label: 'newsletter markup' },
  { re: /\b(no[- ]reply|do not reply|donotreply)\b/i, label: 'automated sender' },
  { re: /\b(receipt|payment (received|successful)|order confirmation|your order|invoice #\d|receipt #)\b/i, label: 'automated receipt' },
  { re: /\b(password reset|verify your (email|account)|security alert|sign-?in attempt)\b/i, label: 'automated security notice' },
  { re: /\b(newsletter|digest|roundup|weekly (update|brief)|daily brief)\b/i, label: 'newsletter/digest' },
  { re: /\b(alert (resolved|cleared)|monitoring|uptime|all systems operational)\b/i, label: 'automated system alert' },
  { re: /\b(calendar|invitation):\s.*\b(accepted|declined|updated)\b/i, label: 'automated calendar notice' },
  { re: /\bnotification\b/i, label: 'automated notification' },
];

const APPROVAL_WORDS = /\b(approv|sign[- ]?off|proceed|go ahead|term sheet|counter[- ]?sign)\b/i;

function collectHits(text, signals) {
  const hits = [];
  for (const s of signals) if (s.re.test(text)) hits.push(s.label);
  return hits;
}

function clamp01(n) { return Math.max(0.05, Math.min(0.99, n)); }

export function fallbackClassify({ subject = '', messages = [], senderName = '' }) {
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  const text = `${subject}\n${senderName}\n${messages.map((m) => `${m.sender_name}: ${m.body}`).join('\n')}`;

  const clientHits = collectHits(text, CLIENT_SIGNALS);
  const assistantHits = collectHits(text, ASSISTANT_SIGNALS);
  const noneHits = collectHits(text, NONE_SIGNALS);

  // Weighted scores
  let clientScore = clientHits.length * 2 + (APPROVAL_WORDS.test(text) ? 1.5 : 0);
  let assistantScore = assistantHits.length * 2;
  let noneScore = noneHits.length * 2.5;

  // Question directed at the client with a decision verb boosts client score
  if (/\?\s*$/.test((lastInbound?.body || '').trim()) && clientScore > 0) clientScore += 1;

  const scores = [
    { label: 'assistant', score: assistantScore, hits: assistantHits },
    { label: 'client', score: clientScore, hits: clientHits },
    { label: 'none', score: noneScore, hits: noneHits },
  ].sort((a, b) => b.score - a.score);

  const [top, second] = scores;
  let classification, confidence, reason;

  if (top.score === 0) {
    classification = 'assistant';
    confidence = 0.42;
    reason = 'No strong signals matched; defaulting to assistant with low confidence for manual review.';
  } else if (top.score - (second?.score || 0) < 2 && second.score > 0) {
    // Genuinely ambiguous between two classes
    classification = top.label;
    confidence = 0.55;
    reason = `Ambiguous signals (${top.label}: ${top.hits.join(', ')} vs ${second.label}: ${second.hits.join(', ')}). Flagging for human review.`;
  } else {
    classification = top.label;
    confidence = clamp01(0.62 + top.score * 0.09);
    const labels = { assistant: 'assistant-handleable logistics', client: 'client-decision language', none: 'automated/no-reply markers' };
    reason = `Matched ${labels[classification]}: ${top.hits.join(', ')}.`;
  }

  const needsReview = confidence < 0.6;
  const importance = URGENT.test(text) ? 'high' : 'normal';

  // Template summary: first meaningful sentences of the latest inbound message
  const raw = (lastInbound?.body || '').replace(/\s+/g, ' ').trim();
  const firstSentences = raw.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
  const summary = `${lastInbound?.sender_name || 'Sender'} wrote: “${firstSentences.length > 220 ? firstSentences.slice(0, 217) + '…' : firstSentences}”`;

  const suggestedAction = {
    assistant: 'Draft a reply and handle this on the client’s behalf — review before sending.',
    client: 'Forward to the client for a personal decision; do not act until they approve.',
    none: 'No response needed. Archive or file automatically.',
  }[classification];

  return {
    classification,
    confidence: Number(confidence.toFixed(2)),
    summary,
    reason,
    suggested_action: suggestedAction,
    needs_review: needsReview,
    importance,
    approval_requested: classification === 'client' && APPROVAL_WORDS.test(text),
    meeting_candidate: DATE_OR_TIME.test(text),
    engine: 'fallback',
  };
}

export function fallbackDraftReply({ subject = '', messages = [], clientName = 'the client', assistantName = 'Priya' }) {
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  const firstName = (lastInbound?.sender_name || 'there').split(' ')[0];
  const lower = `${subject} ${lastInbound?.body || ''}`.toLowerCase();

  if (/\b(approv|sign|proceed|term sheet|go ahead)\b/.test(lower)) {
    return `Hi ${firstName},\n\nThanks for the note. I’ve flagged this for ${clientName} personally — it’s their call, so I’ll come back with a decision rather than confirm anything on my own.\n\nI’ll aim to get you an answer by the end of the week. Please don’t send anything to counterparties yet.\n\nBest regards,\n${assistantName}\nPersonal Assistant to ${clientName}`;
  }
  if (/\b(schedule|availability|call|meeting|slot)\b/.test(lower)) {
    return `Hi ${firstName},\n\nThanks for reaching out. ${clientName} is available for a 30-minute call — I’ll send a calendar invite shortly once I confirm a slot that works.\n\nIf you have two or three times that suit you, share them and I’ll lock one in.\n\nBest regards,\n${assistantName}\nPersonal Assistant to ${clientName}`;
  }
  return `Hi ${firstName},\n\nThanks for your note. I’ve received it and will take care of it on ${clientName}’s behalf — I’ll get back to you shortly with the details.\n\nBest regards,\n${assistantName}\nPersonal Assistant to ${clientName}`;
}
