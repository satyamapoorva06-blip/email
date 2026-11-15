// Seed script — realistic demo data for the two demo clients.
// Runs automatically on first start (when the DB is empty), or with --force.
// Timestamps are generated relative to "now" so the demo always feels alive.
import { exec, get, run, nowIso } from './db.js';
import { hashPassword } from './auth.js';

const FORCE = process.argv.includes('--force');
const ALREADY = (await get('SELECT COUNT(*) AS n FROM users')).n > 0;
if (ALREADY && !FORCE) {
  console.log('[seed] database already seeded — skipping (run `npm run seed` to rebuild)');
} else {
if (FORCE) {
  await exec(`DELETE FROM attachments; DELETE FROM messages; DELETE FROM notifications; DELETE FROM activity_log;
           DELETE FROM meetings; DELETE FROM conversations; DELETE FROM connected_accounts; DELETE FROM settings;
           DELETE FROM clients; DELETE FROM sessions; DELETE FROM users;`);
}

const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const hoursAgo = (h) => iso(now - h * 3600e3);
const at = (daysFromNow, hour, minute = 0) => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); d.setHours(hour, minute, 0, 0); return d.toISOString(); };

// ---------------------------------------------------------------- users
const assistantPw = 'demo1234';
const priya = await run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)',
  'Priya Sharma', 'priya@relay.app', hashPassword(assistantPw), 'assistant', '#4F46E5', nowIso());
const priyaId = Number(priya.lastInsertRowid);

const rahul = await run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)',
  'Rahul Mehta', 'rahul@meridianventures.com', hashPassword('demo1234'), 'client', '#0F766E', nowIso());
const rahulId = Number(rahul.lastInsertRowid);

const anita = await run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)',
  'Anita Desai', 'anita@loomandco.com', hashPassword('demo1234'), 'client', '#B45309', nowIso());
const anitaId = Number(anita.lastInsertRowid);

await run('INSERT INTO settings (user_id, signature, timezone) VALUES (?,?,?)', priyaId, 'Warm regards,\nPriya Sharma\nExecutive Personal Assistant to Rahul & Anita', 'Asia/Kolkata');
await run('INSERT INTO settings (user_id) VALUES (?)', rahulId);
await run('INSERT INTO settings (user_id) VALUES (?)', anitaId);

// ---------------------------------------------------------------- clients
const meridian = await run('INSERT INTO clients (assistant_id, user_id, name, company, email, role_title, avatar_color, created_at) VALUES (?,?,?,?,?,?,?,?)',
  priyaId, rahulId, 'Rahul Mehta', 'Meridian Ventures', 'rahul@meridianventures.com', 'Managing Partner', '#0F766E', nowIso());
const meridianId = Number(meridian.lastInsertRowid);

const loom = await run('INSERT INTO clients (assistant_id, user_id, name, company, email, role_title, avatar_color, created_at) VALUES (?,?,?,?,?,?,?,?)',
  priyaId, anitaId, 'Anita Desai', 'Loom & Co.', 'anita@loomandco.com', 'Founder & CEO', '#B45309', nowIso());
const loomId = Number(loom.lastInsertRowid);

// ----------------------------------------------------- connected accounts (simulated)
const acct = async (clientId, provider, email, syncedHoursAgo) =>
  await run('INSERT INTO connected_accounts (client_id, provider, email, status, mode, last_synced_at, created_at) VALUES (?,?,?,?,?,?,?)',
    clientId, provider, email, 'connected', 'simulated', hoursAgo(syncedHoursAgo), nowIso());
await acct(meridianId, 'gmail', 'rahul.mehta@meridianventures.com', 0.2);
await acct(meridianId, 'outlook', 'rahul@meridianventures.com', 2);
await acct(loomId, 'gmail', 'anita@loomandco.com', 0.1);
await acct(loomId, 'outlook', 'anita@loomandco.com', 26);

// ------------------------------------------------------------ conversation seed helper
async function addConversation(c) {
  const createdIso = hoursAgo(c.created_hours_ago ?? 48);
  const lastActivity = iso(Math.max(...c.messages.map((m) => now - (m.hours_ago ?? 0) * 3600e3)));
  const out = await run(`INSERT INTO conversations
    (client_id, subject, classification, confidence, summary, reason, suggested_action, needs_review,
     status, is_read, is_starred, importance, approval_status, approval_note, waiting_since, last_activity_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    c.client === 'meridian' ? meridianId : loomId,
    c.subject,
    c.classification, c.confidence, c.summary, c.reason, c.suggested_action,
    c.needs_review ? 1 : 0,
    c.status || 'open', c.is_read ? 1 : 0, c.is_starred ? 1 : 0,
    c.importance || 'normal', c.approval_status || 'none', c.approval_note || null,
    c.waiting_hours_ago ? hoursAgo(c.waiting_hours_ago) : null,
    lastActivity, createdIso);
  const convoId = Number(out.lastInsertRowid);
  for (const m of c.messages) {
    const msg = await run('INSERT INTO messages (conversation_id, sender_name, sender_email, body, direction, created_at) VALUES (?,?,?,?,?,?)',
      convoId, m.from[0], m.from[1], m.body.trim(), m.dir, hoursAgo(m.hours_ago ?? 0));
    const msgId = Number(msg.lastInsertRowid);
    for (const a of m.attachments || []) {
      await run('INSERT INTO attachments (message_id, filename, size_bytes, kind) VALUES (?,?,?,?)', msgId, a.filename, a.size, a.kind || 'file');
    }
  }
  return convoId;
}

console.log('[seed] inserting demo conversations…');

await addConversation({
  client: 'meridian', created_hours_ago: 50,
  subject: 'Project Halcyon — revised term sheet for sign-off',
  classification: 'client', confidence: 0.93, needs_review: false, is_read: false, is_starred: true, importance: 'high', approval_status: 'pending',
  summary: 'Northgate Legal sent the revised Halcyon acquisition term sheet. Key changes: 4-year vesting on founder equity and a 30-day exclusivity window. Sign-off is needed by Thursday.',
  reason: 'Signature request on a term sheet plus explicit “by Thursday” deadline — a client-level legal/financial decision.',
  suggested_action: 'Request Rahul’s approval to proceed with the revised term sheet before countersigning.',
  messages: [
    { dir: 'inbound', hours_ago: 49, from: ['Vikram Rao', 'v.rao@northgatelegal.com'], body: `Rahul,\n\nAttaching the revised term sheet for Project Halcyon. Changes from v1: founder equity now vests over 4 years (1-year cliff), and the exclusivity window is 30 days instead of 45. Everything else is unchanged.\n\nWe need your sign-off by Thursday so the counterparties can release funds for diligence.\n\nRegards,\nVikram\nNorthgate Legal`,
      attachments: [{ filename: 'Halcyon_Term_Sheet_v2.pdf', size: 2411724, kind: 'pdf' }] },
    { dir: 'inbound', hours_ago: 8, from: ['Vikram Rao', 'v.rao@northgatelegal.com'], body: `Rahul — gentle nudge on the term sheet. If you can confirm today we stay on track for Thursday. Happy to jump on a call if any clause needs walking through.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 30,
  subject: 'Confirm whether we should proceed with the Arclight partnership',
  classification: 'client', confidence: 0.88, is_read: false, importance: 'high', approval_status: 'pending',
  summary: 'Meera Krishnan (Arclight Partners) asks for a go/no-go on the data-sharing partnership. They need an answer before their investment committee meets on Monday.',
  reason: 'Explicit go/no-go business decision requested of the client — it cannot be delegated to the assistant.',
  suggested_action: 'Forward to Rahul for a decision; request approval before proceeding with the partnership discussion.',
  messages: [
    { dir: 'inbound', hours_ago: 26, from: ['Meera Krishnan', 'meera@arclight.in'], body: `Hi Rahul,\n\nFollowing our three sessions this month — can you please confirm whether we should proceed with the proposed partnership? Our investment committee meets on Monday and I need a clear signal from your side before then.\n\nIf the answer is yes, I’ll circulate the joint term sheet to both boards on Tuesday.\n\nBest,\nMeera` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 60,
  subject: 'Catering for the board dinner — 27th',
  classification: 'assistant', confidence: 0.91, is_read: true, importance: 'normal',
  summary: 'The Oberoi events team needs headcount and menu finalisation for the 9-course board dinner on the 27th. Dietary preferences and wine pairing to be confirmed.',
  reason: 'Event logistics and vendor coordination — handleable by the assistant.',
  suggested_action: 'Confirm headcount of 14, the vegetarian options for two guests, and approve the wine pairing.',
  waiting_hours_ago: 30,
  messages: [
    { dir: 'inbound', hours_ago: 59, from: ['The Oberoi — Events', 'events@tajhotels.com'], body: `Dear Priya,\n\nConfirming arrangements for Mr Mehta’s board dinner on the 27th. Could you please share the final headcount, menu selection, and any dietary requirements? Attaching the current menu for review.\n\nRegards,\nAditi\nEvents Team`,
      attachments: [{ filename: 'Board_Dinner_Menu_v3.pdf', size: 1187840, kind: 'pdf' }] },
    { dir: 'outbound', hours_ago: 30, from: ['Priya Sharma · Assistant to Rahul Mehta', 'rahul@meridianventures.com'], body: `Hi Aditi,\n\nHeadcount is 14. Two guests are vegetarian — please keep the paneer course as-is for them. Mr Mehta approves the wine pairing shown in the attached menu.\n\nCould you also confirm the table layout and AV for the welcome address at 7:30pm?\n\nWarm regards,\nPriya Sharma\nAssistant to Rahul Mehta` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 20,
  subject: 'Invoice INV-2041 — diligence fees ₹18.4L',
  classification: 'client', confidence: 0.58, needs_review: true, is_read: false, importance: 'high',
  summary: 'Northgate Legal invoiced ₹18.4L for diligence — 15% above the earlier estimate. Payment release likely needs Rahul’s nod given the overrun.',
  reason: 'Ambiguous: mentions a payment overrun against an estimate — could be routine accounts payable or a spend-approval decision. Flagged for human review.',
  suggested_action: 'Check the engagement letter, then either release payment or ask Rahul to approve the overrun.',
  messages: [
    { dir: 'inbound', hours_ago: 20, from: ['Northgate Legal — Billing', 'billing@northgatelegal.com'], body: `Dear Mr Mehta,\n\nPlease find invoice INV-2041 for ₹18,40,000 covering diligence on Project Halcyon. This is ~15% above the indicative estimate on the engagement letter, driven by the additional counterparty data room.\n\nLet us know if you would like to proceed with payment.\n\nAccounts, Northgate Legal`,
      attachments: [{ filename: 'Northgate_INV-2041.pdf', size: 482113, kind: 'pdf' }] },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 78,
  subject: 'Your Figma invoice — payment received',
  classification: 'none', confidence: 0.97, is_read: true, importance: 'normal',
  summary: 'Automated receipt confirming payment of the Figma Professional subscription.',
  reason: 'Automated receipt with a do-not-reply address — nothing to action.',
  suggested_action: 'File for records; no response required.',
  messages: [
    { dir: 'inbound', hours_ago: 78, from: ['Figma Billing', 'billing@figma.com'], body: `Your payment was received.\n\nReceipt #2841-7731\nFigma Professional — 5 seats\nAmount: $75.00/month\nBilled to Visa ••4242\n\nYou can download the full receipt from your billing dashboard. This is an automated message; please do not reply.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 12,
  subject: 'The Daily Byte — Markets open mixed, Fed holds',
  classification: 'none', confidence: 0.95, is_read: false, importance: 'low',
  summary: 'Morning market newsletter. Nothing client-specific; standard financial-press digest.',
  reason: 'Newsletter markup (unsubscribe link, digest format) — automated bulk mail.',
  suggested_action: 'No action. Archive when the inbox is swept.',
  messages: [
    { dir: 'inbound', hours_ago: 12, from: ['The Daily Byte', 'newsletter@dailybyte.in'], body: `Good morning.\n\nMarkets opened mixed on Friday…\n• Fed holds rates steady\n• Halcyon peers trade at 14.2x forward earnings\n• Brent crude at $78\n\nUnsubscribe | View in browser | Advertise` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 26,
  subject: 'Ops review Thursday — two of you are double-booked',
  classification: 'assistant', confidence: 0.9, is_read: true, importance: 'normal',
  summary: 'Neha (Ops) flagged a clash: Rahul’s 4pm Thursday conflicts with the LP call. Both sides can move to Friday 10:30am.',
  reason: 'Calendar coordination and scheduling — classic assistant work.',
  suggested_action: 'Confirm Friday 10:30am with both parties and move the calendar hold.',
  waiting_hours_ago: 9,
  messages: [
    { dir: 'inbound', hours_ago: 26, from: ['Neha Kapoor', 'neha.kapoor@meridianventures.com'], body: `Priya — Thursday 4pm has both the ops review and the LP update call. Can we shift the ops review to Friday 10:30? Krish is free too.` },
    { dir: 'outbound', hours_ago: 9, from: ['Priya Sharma · Assistant to Rahul Mehta', 'rahul@meridianventures.com'], body: `Neha, Krish — Friday 10:30 works from our side. I’ve tentatively moved the hold; please accept the updated invite once it lands.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 100,
  subject: 'Q3 investor update — final draft for your sign-off',
  classification: 'client', confidence: 0.86, is_read: true, importance: 'high', is_starred: true, approval_status: 'none',
  summary: 'The Q3 investor letter is drafted. Two portfolio marks changed since v2. Rahul should read the performance section before it goes to LPs.',
  reason: 'External communication to investors requires the managing partner’s personal sign-off before it is sent.',
  suggested_action: 'Ask Rahul to review pages 2–4 of the letter before it goes out Monday.',
  messages: [
    { dir: 'inbound', hours_ago: 100, from: ['Investor Relations', 'ir@meridianventures.com'], body: `Rahul, Priya,\n\nFinal draft of the Q3 investor letter is attached. Changes since v2: two portfolio marks (Halcyon +18%, Casa Verde flat), and the audit note on page 3.\n\nWe’d like to circulate Monday — please review pages 2–4 before we release.\n\nIR Team`,
      attachments: [{ filename: 'Meridian_Q3_Investor_Letter_FINAL.pdf', size: 1612022, kind: 'pdf' }] },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 15,
  subject: 'Mumbai ↔ Bengaluru, 18–20 Nov — seat and hotel preferences',
  classification: 'assistant', confidence: 0.9, is_read: false, importance: 'normal',
  summary: 'Travel desk needs seat preference and hotel choice for the 18–20 Nov trip. Two options: The Leela or Taj West End.',
  reason: 'Travel booking logistics — the assistant can complete this once preferences are known.',
  suggested_action: 'Confirm aisle seat, lounge access, and hotel preference; then approve the booking.',
  messages: [
    { dir: 'inbound', hours_ago: 15, from: ['Yatra Travel Desk', 'support@yatratravel.in'], body: `Dear Priya,\n\nFor Mr Mehta’s trip: 18 Nov BOM→BLR 6:10am, return 20 Nov 9:25pm. Available seats: 4A, 4C. Hotel options: The Leela (₹18,500/night) or Taj West End (₹16,200/night). Please confirm before 6pm to hold rates.\n\nAccount manager, Yatra` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 40,
  subject: 'LinkedIn: 3 new notifications',
  classification: 'none', confidence: 0.96, is_read: true, importance: 'low',
  summary: 'Automated LinkedIn digest: two profile views and one connection request.',
  reason: 'Bulk automated notification with unsubscribe/footer markers.',
  suggested_action: 'No action needed.',
  messages: [
    { dir: 'inbound', hours_ago: 40, from: ['LinkedIn', 'notifications@linkedin.com'], body: `You have 3 new notifications:\n• 2 people viewed your profile\n• New connection request from Sanjay Gupta (Partner, Vertex PE)\n\nView on LinkedIn. Unsubscribe from these emails.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 120,
  subject: 'Following up: vendor scorecard comments',
  classification: 'assistant', confidence: 0.82, is_read: true, importance: 'normal',
  summary: 'Sent the vendor scorecard to the selection committee 5 days ago — no comments yet. A nudge is due before Monday’s decision meeting.',
  reason: 'Follow-up coordination that waits on the counterparty; assistant owns the chase.',
  suggested_action: 'Send a polite nudge today; if still silent by Sunday, flag to Rahul.',
  waiting_hours_ago: 96,
  messages: [
    { dir: 'outbound', hours_ago: 96, from: ['Priya Sharma · Assistant to Rahul Mehta', 'rahul@meridianventures.com'], body: `Anjali, Team — sharing the vendor scorecard ahead of Monday’s selection meeting. Please add your comments directly in the doc by Sunday evening so we can consolidate on Monday morning.\n\nBest,\nPriya` },
    { dir: 'inbound', hours_ago: 118, from: ['Anjali Menon', 'anjali.menon@meridianventures.com'], body: `Shared on 11 Nov. Waiting on comments from IT and Finance before we lock the shortlist.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 200,
  subject: 'NDA counter: 2-year term instead of 3?',
  classification: 'client', confidence: 0.84, is_read: true, importance: 'normal', approval_status: 'approved',
  approval_note: 'Approved by Rahul Mehta on 12 Nov',
  summary: 'Acme asked to shorten the NDA term from 3 years to 2. Rahul already approved the concession verbally on the 12th.',
  reason: 'Contract term change — client’s call, though it has been decided as of 12 Nov.',
  suggested_action: 'Confirm the 2-year term to Acme in writing so the NDA can be signed.',
  messages: [
    { dir: 'inbound', hours_ago: 200, from: ['Devika Shetty', 'devika@acmecorp.in'], body: `Priya — legal on your side asked for 3 years; we can do 2. Is that acceptable to Mr Mehta? We’d like to close this week.` },
    { dir: 'inbound', hours_ago: 176, from: ['Rahul Mehta', 'rahul@meridianventures.com'], body: `Priya — yes, 2 years is fine. Confirm to Devika and get it signed.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 52,
  subject: 'Security alert: sign-in from a new device',
  classification: 'none', confidence: 0.93, is_read: true, importance: 'high',
  summary: 'Google flagged a sign-in to Rahul’s account from a new Mac in Bengaluru. It matches the office device fingerprint; no action taken.',
  reason: 'Automated security notification (no-reply sender) — but worth a skim because it is security-related.',
  suggested_action: 'No reply needed. Verified as known device; keep an eye on further alerts.',
  messages: [
    { dir: 'inbound', hours_ago: 52, from: ['Google Account', 'no-reply@accounts.google.com'], body: `Critical security alert — new sign-in to rahul.mehta@meridianventures.com\nDevice: MacBook Pro, Chrome — Bengaluru, IN\nTime: yesterday, 9:41 pm IST\n\nIf this was you, no action is needed. If not, secure your account immediately. This alert was automatic.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 28,
  subject: 'Diwali edit launch — your go/no-go',
  classification: 'client', confidence: 0.91, is_read: false, is_starred: true, importance: 'high', approval_status: 'pending',
  summary: 'Rohit (Category) wants the go/no-go on the Diwali edit drop for 22 Nov. Photoshoot and CD are booked pending confirmation.',
  reason: 'Launch decision with commercial and brand consequences — the founder must decide.',
  suggested_action: 'Get Anita’s go/no-go today; without it the shoot and CD booking lapse.',
  messages: [
    { dir: 'inbound', hours_ago: 28, from: ['Rohit Verma', 'rohit.verma@loomandco.com'], body: `Anita,\n\nFinal call needed on the Diwali edit. Creative is locked, CD is booked for 21 Nov, and the shoot date is 22 Nov. Inventory lands 19 Nov. Please confirm you want to go ahead — if we don’t hear by tomorrow evening, I’ll need to release the CD slot.\n\nRohit` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 44,
  subject: 'Casa Verde partnership — go / no-go before Monday',
  classification: 'client', confidence: 0.89, is_read: false, importance: 'high', approval_status: 'pending',
  summary: 'Casa Verde (retail partner) needs Anita’s decision on an exclusive 6-month collaboration. Their term sheet proposes 12% revenue share.',
  reason: 'Commercial partnership with an exclusivity clause — a founder-level judgement call; approval requested explicitly.',
  suggested_action: 'Forward the term sheet summary to Anita and request approval or rejection by Sunday.',
  messages: [
    { dir: 'inbound', hours_ago: 44, from: ['Isabela Fontaine', 'isabela@casaverde.com'], body: `Dear Anita,\n\nIt was a pleasure meeting at the Jaipur showcase. As discussed, attached is the Casa Verde term sheet — exclusive distribution across India for 6 months, 12% revenue share, we handle logistics.\n\nWe would love to announce this at Lakmé on the 28th, so a decision by Monday would be ideal.\n\nWarmly,\nIsabela`,
      attachments: [{ filename: 'CasaVerde_TermSheet.pdf', size: 932184, kind: 'pdf' }] },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 70,
  subject: 'Influencer contract — scope changes for Ananya S',
  classification: 'client', confidence: 0.8, is_read: false, importance: 'normal', approval_status: 'none',
  summary: 'Studio Palak wants to widen Ananya’s deliverables (2 reels → 4) with a fee increase of ₹1.2L. Scope sign-off needed before contract issuance.',
  reason: 'Contract scope and budget change — requires the founder’s approval even though it looks routine.',
  suggested_action: 'Confirm the revised scope and fee with Anita before Studio Palak issues the contract.',
  messages: [
    { dir: 'inbound', hours_ago: 70, from: ['Studio Palak', 'hello@studiopalak.com'], body: `Hi Anita,\n\nAnanya is excited about the Diwali edit. She’d like to expand from 2 reels to 4 deliverables — fee moves from ₹3.6L to ₹4.8L. Can we confirm scope this week? Contract is ready to issue on your go-ahead.\n\nPalak`,
      attachments: [{ filename: 'AnanyaS_Influencer_SCOPE.pdf', size: 611020, kind: 'pdf' }] },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 30,
  subject: 'Loom & Co. — weekly metrics digest',
  classification: 'none', confidence: 0.97, is_read: true, importance: 'low',
  summary: 'Automated weekly digest: sessions, conversion, top SKUs. Downloaded for the ops review.',
  reason: 'Automated metrics digest from the analytics tool (unsubscribe footer present).',
  suggested_action: 'No response required; numbers are in the digest dashboard.',
  messages: [
    { dir: 'inbound', hours_ago: 30, from: ['Metrics · Loom & Co.', 'digest@analyzr.io'], body: `Weekly digest — 3–9 Nov\nSessions 84,211 (+6.2%) · Conversion 2.31% · AOV ₹2,480\nTop SKU: Block-print kurta (indigo) — 1,240 units\n\nUnsubscribe from these digests.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 9,
  subject: 'Your BlueTokai order has shipped',
  classification: 'none', confidence: 0.94, is_read: false, importance: 'low',
  summary: 'Courier tracking for the studio’s coffee order. Delivery expected tomorrow by 7pm.',
  reason: 'Automated shipment notification from a courier — nothing to send back.',
  suggested_action: 'No action; track via the link if needed.',
  messages: [
    { dir: 'inbound', hours_ago: 9, from: ['BlueTokai', 'shipping@bluetokai.com'], body: `Your order #BT-2291 (2kg Attikan single origin) has shipped. Arriving tomorrow by 7pm. Track: bluetokai.com/t/BT-2291\n\nThis is an automated message.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 18,
  subject: 'Head of Design — interview loop scheduling',
  classification: 'assistant', confidence: 0.93, is_read: false, importance: 'normal',
  summary: 'Sneha (Talent) needs panel slots for the four design candidates across next week. Anita’s calendar is preferred for the portfolio round.',
  reason: 'Interview coordination across calendars — squarely assistant work.',
  suggested_action: 'Propose Mon/Tue/Thu slots; hold Anita’s mornings for the portfolio deep-dives.',
  messages: [
    { dir: 'inbound', hours_ago: 18, from: ['Sneha Iyer', 'sneha.iyer@loomandco.com'], body: `Anita, Priya — the Head of Design loop is set for next week. Candidates: Arjun, Kavya, Devansh, Rhea. Rounds: portfolio (Anita, 60m) + craft (design team, 45m) + founder values (Anita, 30m). Please share Anita’s availability and I’ll send the loop.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 36,
  subject: 'Studio shoot Saturday — call sheet',
  classification: 'assistant', confidence: 0.88, is_read: true, importance: 'normal',
  summary: 'Frame House shared the Saturday call sheet for the Diwali campaign shoot. Needs your confirmation on parking and catering counts.',
  reason: 'Production logistics — confirm counts and venue details directly with the studio.',
  suggested_action: 'Confirm parking for 6 crew vehicles and 18 covers of catering; print the call sheet.',
  waiting_hours_ago: 12,
  messages: [
    { dir: 'inbound', hours_ago: 36, from: ['Frame House Productions', 'shoot@framehouse.in'], body: `Call sheet attached for Saturday. Load-in 6:30am, first setup 7:30, shoot 8:30–18:30. Need: parking confirmation (6 vehicles), catering headcount, and Anita’s arrival ETA for the cue notes.`,
      attachments: [{ filename: 'Diwali_Shoot_CallSheet.pdf', size: 724118, kind: 'pdf' }] },
    { dir: 'outbound', hours_ago: 12, from: ['Priya Sharma · Assistant to Anita Desai', 'anita@loomandco.com'], body: `Apurv — confirmed: 6 crew vehicles + Anita’s car, catering for 18 covers, load-in as planned. Anita will be on set by 9am for the cue notes review.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 52,
  subject: 'Zoom invites updated (2)',
  classification: 'none', confidence: 0.92, is_read: true, importance: 'low',
  summary: 'Calendar automation notices: two recurring calls moved by 15 minutes.',
  reason: 'Automated calendar update notifications — records already updated in the calendar.',
  suggested_action: 'Nothing to do; calendar is already updated.',
  messages: [
    { dir: 'inbound', hours_ago: 52, from: ['Zoom', 'no-reply@zoom.us'], body: `Your meeting invitations were updated:\n• Weekly standup — moved to 10:15am\n• Vendor sync — moved to 4:30pm\nNotification only, no response required.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 16,
  subject: 'PO #LM-118 — single-origin coffee supply, ₹2,40,000',
  classification: 'client', confidence: 0.52, needs_review: true, is_read: false, importance: 'normal',
  summary: 'Operations asks to raise a ₹2.4L purchase order for 3 months of single-origin coffee. It is above the ₹1L auto-approval threshold — just over the line.',
  reason: 'Ambiguous: labelled “routine monthly PO” but the amount exceeds the auto-approval threshold — the founder’s call by policy.',
  suggested_action: 'Ask Anita to approve the PO, or confirm the standing PO can be extended without fresh approval.',
  messages: [
    { dir: 'inbound', hours_ago: 16, from: ['Ops — Loom & Co.', 'ops@loomandco.com'], body: `Anita,\n\nRaising PO #LM-118 for the studio’s coffee supply — ₹2,40,000 for 3 months, same terms as last quarter. Slightly above the ₹1L auto-approve line, so it needs your nod.\n\nOps`,
      attachments: [{ filename: 'PO_LM-118.pdf', size: 355432, kind: 'pdf' }] },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 11,
  subject: 'Packaging mock feedback — 10 minutes this week?',
  classification: 'assistant', confidence: 0.68, is_read: false, importance: 'normal',
  summary: 'The packaging designer wants quick direction on the two shortlisted mocks (“Kesar” vs “Indigo”). Likely needs Anita’s taste, but the scheduling can be arranged by the assistant.',
  reason: 'Leans assistant (scheduling + gathering input), though the creative call itself is the founder’s — confidence is moderate.',
  suggested_action: 'Book a 15-minute review slot; prepare both mocks side-by-side for Anita.',
  messages: [
    { dir: 'inbound', hours_ago: 11, from: ['Kiara — Packaging Design', 'kiara@studiokh.com'], body: `Hi Anita,\n\nTwo shortlisted mocks for the festive line are attached as links. Could you give 10 minutes this week for direction? I need your pick between “Kesar” and “Indigo” before the print deadline on Friday.\n\nKiara` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 26,
  subject: 'Retail Weekly — “quiet luxury” inventory moves',
  classification: 'none', confidence: 0.9, is_read: false, importance: 'low',
  summary: 'Industry newsletter on quiet-luxury assortment shifts among D2C labels.',
  reason: 'Industry newsletter with unsubscribe footer — no reply.',
  suggested_action: 'No action; skim at leisure.',
  messages: [
    { dir: 'inbound', hours_ago: 26, from: ['Retail Weekly', 'digest@retailweekly.com'], body: `This week in retail:\n• Quiet luxury pulls back further in tier-2 cities\n• Festive sell-through rates hit 78% for D2C labels\n• Three new Jaipur pop-up formats\n\nUnsubscribe · View in browser` },
  ],
});

// ---------------- completed / archived threads (variety + history)
await addConversation({
  client: 'meridian', created_hours_ago: 220,
  subject: 'Term sheet v1 — annotated copy back to you',
  classification: 'assistant', confidence: 0.85, status: 'completed', is_read: true, importance: 'normal',
  summary: 'Completed: annotated v1 sent back to counterparties with Rahul’s three comments.',
  reason: 'Document turnaround handled by the assistant.',
  suggested_action: 'Done — see Halcyon v2 thread for the current state.',
  messages: [
    { dir: 'outbound', hours_ago: 220, from: ['Priya Sharma · Assistant to Rahul Mehta', 'rahul@meridianventures.com'], body: `Vikram — returned the annotated v1 with Mr Mehta’s three comments (vesting, exclusivity, break fee).` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 150,
  subject: 'Q2 milestone — thank you note to the team',
  classification: 'assistant', confidence: 0.94, status: 'completed', is_read: true, importance: 'low',
  summary: 'Completed: thank-you note sent to the Loom & Co. team after the Q2 milestone.',
  reason: 'Routine communication drafted and sent by the assistant.',
  suggested_action: 'Done.',
  messages: [
    { dir: 'outbound', hours_ago: 150, from: ['Priya Sharma · Assistant to Anita Desai', 'anita@loomandco.com'], body: `Team — Anita asked me to pass on her thanks for the Q2 push. Truly appreciated.` },
  ],
});

await addConversation({
  client: 'meridian', created_hours_ago: 300,
  subject: 'Offsite venue shortlist — Pawna Lake vs. Soma Vine Village',
  classification: 'assistant', confidence: 0.87, status: 'archived', is_read: true, importance: 'normal',
  summary: 'Archived: venue shortlist with costs; booking is on hold while dates are finalised.',
  reason: 'Logistics research completed; parked for now.',
  suggested_action: 'Revisit when the offsite date is confirmed.',
  messages: [
    { dir: 'inbound', hours_ago: 300, from: ['OffsiteCo', 'hello@offsiteco.in'], body: `Attaching the shortlist: Pawna Lake (₹6.8L, 3 days) vs. Soma Vine Village (₹7.4L, 3 days) including AV and stays.` },
  ],
});

await addConversation({
  client: 'loom', created_hours_ago: 260,
  subject: 'Growth marketing teardown (last week)',
  classification: 'none', confidence: 0.88, status: 'archived', is_read: true, importance: 'low',
  summary: 'Archived newsletter teardown of the autumn campaign benchmarks.',
  reason: 'Automated newsletter; archived in the weekly sweep.',
  suggested_action: 'None.',
  messages: [
    { dir: 'inbound', hours_ago: 260, from: ['The Growth Memo', 'memo@growthmemo.agency'], body: `Benchmarks inside: CPMs up 11%, festive creative lifted CTR by 34%… Unsubscribe` },
  ],
});

// ------------------------------------------------------------ meetings
const mtg = async (clientId, convoIdx, title, start, end, location, attendees, source) =>
  await run('INSERT INTO meetings (client_id, conversation_id, title, start_at, end_at, location, attendees, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    clientId, convoIdx, title, start, end, location, attendees, source, nowIso());
const convoIdBySubject = async (s) => (await get('SELECT id FROM conversations WHERE subject = ?', s))?.id || null;

await mtg(meridianId, await convoIdBySubject('Catering for the board dinner — 27th'), 'Board dinner — Rahul’s welcome address', at(12, 19, 30), at(12, 22, 0), 'The Oberoi, Grand Ballroom', 'Rahul Mehta, Board of Directors, Priya Sharma', 'extracted');
await mtg(loomId, await convoIdBySubject('Head of Design — interview loop scheduling'), 'Head of Design — portfolio round: Arjun', at(2, 10, 0), at(2, 11, 0), 'Loom & Co. — Studio 4, Video Meet', 'Anita Desai, Arjun Malhotra, Sneha Iyer', 'extracted');
await mtg(loomId, await convoIdBySubject('Head of Design — interview loop scheduling'), 'Head of Design — craft round: Kavya', at(3, 11, 30), at(3, 12, 15), 'Loom & Co. — Studio 2', 'Design team, Kavya Nair', 'extracted');
await mtg(meridianId, await convoIdBySubject('Ops review Thursday — two of you are double-booked'), 'Ops review (moved to Friday 10:30)', at(4, 10, 30), at(4, 11, 15), 'Google Meet', 'Rahul Mehta, Neha Kapoor, Krish', 'extracted');
await mtg(loomId, await convoIdBySubject('Casa Verde partnership — go / no-go before Monday'), 'Casa Verde × Loom — intro call', at(5, 16, 0), at(5, 16, 45), 'Video Meet', 'Anita Desai, Isabela Fontaine', 'extracted');
await mtg(meridianId, null, 'Aspire fund quarterly catch-up', at(-6, 17, 0), at(-6, 17, 45), 'Rahul’s office', 'Rahul Mehta', 'manual');

// ------------------------------------------------------------ activity timeline
const act = async (clientId, role, action, detail, hoursAgo_) =>
  await run('INSERT INTO activity_log (client_id, actor_role, action, detail, created_at) VALUES (?,?,?,?,?)', clientId, role, action, detail, hoursAgo(hoursAgo_));

await act(meridianId, 'system', 'account_connected', 'Simulated Gmail connection for rahul.mehta@meridianventures.com (demo mode — no real credentials).', 24 * 14);
await act(loomId, 'system', 'account_connected', 'Simulated Gmail connection for anita@loomandco.com (demo mode — no real credentials).', 24 * 13);
await act(meridianId, 'ai', 'classified', 'AI classified “Project Halcyon — revised term sheet” as Client to reply (93% confidence).', 46);
await act(meridianId, 'ai', 'classified', 'AI classified “Invoice INV-2041” for human review (58% confidence — ambiguous signal).', 19);
await act(meridianId, 'assistant', 'sent_reply', 'Priya sent a reply on Rahul Mehta’s behalf in “Catering for the board dinner — 27th”.', 30);
await act(loomId, 'client', 'asked_assistant', 'Anita asked the assistant to handle “Head of Design — interview loop scheduling”.', 72);
await act(loomId, 'ai', 'meeting_extracted', 'Extracted “Head of Design — portfolio round” from the interview loop thread.', 5);
await act(meridianId, 'client', 'handled', 'Rahul marked “Q2 milestone — thank-you note to the team” as handled.', 24 * 5);
await act(loomId, 'assistant', 'reclassified', 'Priya reclassified “Packaging mock feedback” as Assistant to reply.', 10);
await act(meridianId, 'ai', 'classified', 'AI classified “Confirm whether we should proceed with the Arclight partnership” as Client to reply (88%).', 26);

// ------------------------------------------------------------ notifications for Priya
const note = async (title, body, read, hoursAgo_) =>
  await run('INSERT INTO notifications (user_id, title, body, read, created_at) VALUES (?,?,?,?,?)', priyaId, title, body, read ? 1 : 0, hoursAgo(hoursAgo_));
await note('Approval pending — Casa Verde × Loom', 'Isabela needs Anita’s go/no-go by Monday. The term sheet is attached to the thread.', false, 3);
await note('Follow-up due — vendor scorecard', 'Anjali has not commented on the scorecard; Monday’s selection meeting depends on it.', false, 7);
await note('Rahul marked an item as handled', '“Q2 milestone — thank-you note to the team” was completed by the client.', true, 24 * 5);

// ------------------------------------------------------------ demo credential summary
console.log('[seed] done. Demo accounts:');
console.log('  Assistant — priya@relay.app / demo1234');
console.log('  Client (Rahul) — rahul@meridianventures.com / demo1234');
console.log('  Client (Anita)  — anita@loomandco.com / demo1234');

}
