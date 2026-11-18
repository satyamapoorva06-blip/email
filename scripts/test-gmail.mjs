// Gmail integration tests — no network. The Gmail API is stubbed via globalThis.fetch.
// Run: node scripts/test-gmail.mjs   (uses an in-memory PGlite Postgres, never touches SQLite/Supabase)
process.env.DATABASE_URL = 'pglite://memory';
process.env.GMAIL_TOKEN_SECRET = 'test-secret-test-secret-test-secret-1234';
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GMAIL_REDIRECT_URI = 'http://localhost:3001/api/gmail/callback';

const assert = (cond, label) => { if (cond) console.log('PASS  ' + label); else { console.error('FAIL  ' + label); process.exitCode = 1; } };

const { encryptToken, decryptToken } = await import('../server/gmail/crypto.js');
const { signState, verifyState, parseThread, buildRawReply, buildAuthUrl, googleConfig } = await import('../server/gmail/google.js');

// ---------- 1. token crypto roundtrip
const secret = 'ya29.fake-access-token-1234567890';
const packed = encryptToken(secret);
assert(packed.startsWith('v1.'), 'encrypt produces v1 envelope');
assert(decryptToken(packed) === secret, 'decrypt roundtrip');
try { decryptToken(packed.slice(0, -4) + 'AAAA'); assert(false, 'tampered token rejected'); } catch { assert(true, 'tampered token rejected'); }

// ---------- 2. OAuth state sign/verify
const st = signState({ uid: 7, cid: 42, role: 'client' });
const parsed = verifyState(st);
assert(parsed && parsed.uid === 7 && parsed.cid === 42 && parsed.role === 'client', 'state roundtrip');
assert(verifyState(st.slice(0, -2) + 'xx') === null, 'tampered state rejected');
assert(verifyState('garbage') === null, 'garbage state rejected');

// ---------- 3. consent URL (no token material, right params)
const url = buildAuthUrl({ state: st, redirectUri: process.env.GMAIL_REDIRECT_URI });
assert(url.includes('accounts.google.com/o/oauth2/v2/auth'), 'consent URL host');
assert(url.includes(encodeURIComponent('https://www.googleapis.com/auth/gmail.readonly')), 'readonly scope present');
assert(url.includes('access_type=offline') && url.includes('prompt=consent'), 'offline+consent for refresh token');
assert(!url.includes(process.env.GOOGLE_CLIENT_SECRET), 'client secret never in URL');

// ---------- 4. parseThread on a synthetic Gmail API payload
const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const thread = {
  id: 'threadABC123',
  messages: [
    { id: 'msg1', internalDate: String(Date.now() - 3600e3), labelIds: ['INBOX', 'UNREAD'],
      payload: { mimeType: 'text/plain', headers: [
        { name: 'From', value: 'Vikram Rao <vikram@northgatelegal.com>' },
        { name: 'To', value: 'amansatyam408@gmail.com' },
        { name: 'Subject', value: 'Invoice INV-2041 — diligence fees' },
        { name: 'Message-ID', value: '<abc@northgatelegal.com>' },
      ], body: { data: b64u('Dear Aman,\n\nInvoice INV-2041 attached — ₹18,40,000, ~15% above estimate. Please approve.\n\nVikram') } } },
  ],
};
const parsedThread = parseThread(thread);
assert(parsedThread.thread_id === 'threadABC123', 'thread id parsed');
assert(parsedThread.subject.includes('INV-2041'), 'subject parsed');
assert(parsedThread.messages.length === 1 && parsedThread.messages[0].from_email === 'vikram@northgatelegal.com', 'sender parsed');
assert(parsedThread.messages[0].body.includes('₹18,40,000'), 'body decoded');
assert(parsedThread.messages[0].unread === true, 'UNREAD label detected');
assert(parsedThread.messages[0].message_id_header === '<abc@northgatelegal.com>', 'Message-ID captured for threading');

// ---------- 5. raw reply builder
const raw = buildRawReply({ from: 'amansatyam408@gmail.com', to: 'vikram@northgatelegal.com', subject: 'Invoice INV-2041', body: 'Approved.', references: '<abc@northgatelegal.com>' });
const mime = Buffer.from(raw, 'base64url').toString('utf8');
assert(mime.includes('To: vikram@northgatelegal.com') && mime.includes('Subject: Re: Invoice INV-2041'), 'reply MIME headers');
assert(mime.includes('In-Reply-To: <abc@northgatelegal.com>'), 'threading header present');

// ---------- 6. end-to-end sync against stubbed Gmail API + in-memory Postgres
const FAKE_THREAD = thread;
const FAKE_LIST = { threads: [{ id: 'threadABC123' }] };
const FAKE_PROFILE = { emailAddress: 'amansatyam408@gmail.com' };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'fresh-access-token', expires_in: 3599, scope: 'https://www.googleapis.com/auth/gmail.readonly' });
  if (u.includes('/profile')) return json(FAKE_PROFILE);
  if (u.includes('/threads?')) return json(FAKE_LIST);
  if (u.includes('/threads/threadABC123') && (opts.method || 'GET') === 'GET') return json(FAKE_THREAD);
  return json({ error: { message: `unstubbed fetch: ${u}` } }, 500);
};

const { run, get } = await import('../server/db.js');
const { hashPassword } = await import('../server/auth.js');
const { getGmailAccount, syncGmailForClient, sendGmailReply } = await import('../server/gmail/sync.js');

// minimal fixture: assistant + client + real gmail account with stored tokens
const pw = hashPassword('demo1234');
const a = await run('INSERT INTO users (name, email, password_hash, role, avatar_color, created_at) VALUES (?,?,?,?,?,?)', 'Priya Test', 'priya.test@relay.app', pw, 'assistant', '#4F46E5', new Date().toISOString());
const c = await run('INSERT INTO clients (assistant_id, user_id, name, company, email, role_title, avatar_color, created_at) VALUES (?,?,?,?,?,?,?,?)', Number(a.lastInsertRowid), null, 'Aman Test', 'Personal', 'amansatyam408@gmail.com', 'Principal', '#6D28D9', new Date().toISOString());
const clientId = Number(c.lastInsertRowid);
await run(`INSERT INTO connected_accounts (client_id, provider, email, status, mode, last_synced_at, access_token_enc, refresh_token_enc, token_expiry, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
  clientId, 'gmail', 'amansatyam408@gmail.com', 'connected', 'real', null,
  encryptToken('expired-access-token'), encryptToken('valid-refresh-token'), new Date(Date.now() - 1000).toISOString(), new Date().toISOString());

const account = await getGmailAccount(clientId);
assert(account && account.mode === 'real', 'real gmail account row found');

const result = await syncGmailForClient(clientId, { maxResults: 5 });
assert(result.ok === true && result.imported === 1, `sync imported 1 thread (got: ${JSON.stringify(result)})`);
const convo = await get('SELECT * FROM conversations WHERE client_id = ? AND external_id = ?', clientId, 'threadABC123');
assert(convo && convo.subject.includes('INV-2041'), 'Gmail thread stored as conversation');
assert(['client', 'assistant', 'none'].includes(convo.classification), `AI classified the real thread (got ${convo.classification})`);
const msgCount = (await get('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', convo.id)).n;
assert(msgCount === 1, 'messages imported');

// second sync must not duplicate
const result2 = await syncGmailForClient(clientId, { maxResults: 5 });
const msgCount2 = (await get('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ?', convo.id)).n;
assert(msgCount2 === 1, 're-sync is idempotent (no duplicate messages)');

// send path (stubbed Gmail send) threads the reply and marks our copy
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body });
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'fresh-access-token-2', expires_in: 3599 });
  if (u.includes('/threads/threadABC123')) return json(FAKE_THREAD);
  if (u.includes('/messages/send') && (opts.method || 'POST') === 'POST') return json({ id: 'gmail-sent-999' });
  return json({ error: { message: `unstubbed fetch: ${u}` } }, 500);
};
const sent = await sendGmailReply({ clientId, threadExternalId: 'threadABC123', to: 'vikram@northgatelegal.com', subject: convo.subject, body: 'Approved — please proceed.' });
assert(sent.sent === true && sent.gmailMessageId === 'gmail-sent-999', 'reply sent via Gmail API (stubbed) and id returned');

console.log(process.exitCode ? '\nFAILURES — see above' : '\nALL GMAIL TESTS PASSED');
