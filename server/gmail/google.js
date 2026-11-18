// Google OAuth 2.0 + Gmail API client — no SDK, plain HTTPS (node 18+ fetch).
// Scopes requested are the minimum for the implemented features:
//   gmail.readonly — list/read inbox threads (sync + open conversations)
//   gmail.modify   — mark-read/archive state reflected in Gmail
//   gmail.send     — replies that were explicitly reviewed and approved by the user
import crypto from 'node:crypto';
import { tokenKey } from './crypto.js';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE = 'https://oauth2.googleapis.com/revoke';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
];

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  return {
    clientId,
    clientSecret,
    configured: Boolean(clientId && clientSecret),
    redirectUri: process.env.GMAIL_REDIRECT_URI || '',
  };
}

export function gmailRedirectUri(req) {
  const cfg = googleConfig();
  if (cfg.redirectUri) return cfg.redirectUri;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  return `${proto}://${req.headers.host}/api/gmail/callback`;
}

// ------------------------------------------------------------- state (HMAC-signed, stateless)
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const b64uJson = (obj) => b64u(JSON.stringify(obj));

export function signState(payload) {
  const body = b64uJson({ ...payload, exp: Date.now() + 10 * 60e3, nonce: crypto.randomBytes(8).toString('hex') });
  const sig = crypto.createHmac('sha256', tokenKey()).update(body).digest('base64url');
  return `v1.${body}.${sig}`;
}

export function verifyState(state) {
  try {
    const [v, body, sig] = String(state || '').split('.');
    if (v !== 'v1' || !body || !sig) return null;
    const expected = crypto.createHmac('sha256', tokenKey()).update(body).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch { return null; }
}

export function buildAuthUrl({ state, redirectUri }) {
  const { clientId } = googleConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',           // always issue a refresh_token
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH}?${params.toString()}`;
}

// ------------------------------------------------------------- token lifecycle
async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(12000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error_description || json.error || `HTTP ${res.status}`;
    const err = new Error(`Google OAuth: ${msg}`);
    err.code = json.error || 'oauth_error';
    throw err;
  }
  return json;
}

export function exchangeCode(code, redirectUri) {
  const { clientId, clientSecret } = googleConfig();
  return postForm(GOOGLE_TOKEN, {
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: redirectUri, grant_type: 'authorization_code',
  });
}

export function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = googleConfig();
  return postForm(GOOGLE_TOKEN, {
    refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret,
    grant_type: 'refresh_token',
  });
}

export async function revokeToken(token) {
  try {
    await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(8000) });
    return true;
  } catch { return false; }
}

async function gmailFetch(accessToken, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${GMAIL_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`Gmail API: ${msg}`);
    err.code = json?.error?.status || json?.error?.code || 'gmail_error';
    err.status = res.status;
    throw err;
  }
  return json;
}

export const gmailApi = {
  profile: (t) => gmailFetch(t, '/profile'),
  listThreads: (t, maxResults = 15) => gmailFetch(t, `/threads?maxResults=${maxResults}&q=${encodeURIComponent('in:inbox newer_than:30d -category:promotions')}`),
  getThread: (t, id) => gmailFetch(t, `/threads/${id}?format=full`),
  sendMessage: (t, { raw }) => gmailFetch(t, '/messages/send', { method: 'POST', body: { raw } }),
  modifyThread: (t, id, body) => gmailFetch(t, `/threads/${id}/modify`, { method: 'POST', body }),
};

// ------------------------------------------------------------- parsing (pure — unit-testable)
const b64urlToUtf8 = (data) => Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
const stripHtml = (html) => String(html)
  .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s{3,}/g, '\n\n').trim();

function bodyFromPayload(payload) {
  const walk = (part) => {
    if (!part) return null;
    if (part.mimeType === 'text/plain' && part.body?.data) return b64urlToUtf8(part.body.data);
    if (part.parts) { for (const p of part.parts) { const found = walk(p); if (found) return found; } }
    if (part.mimeType === 'text/html' && part.body?.data) return stripHtml(b64urlToUtf8(part.body.data));
    if (part.body?.data && part.mimeType !== 'text/html') return b64urlToUtf8(part.body.data);
    return null;
  };
  return walk(payload) || '';
}

const header = (msg, name) => (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
export function parseFrom(raw) {
  const m = String(raw || 'Unknown <unknown@unknown>').match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: (m[1] || '').trim() || m[2].split('@')[0], email: m[2].trim().toLowerCase() };
  return { name: String(raw).trim().split('<')[0].trim() || String(raw).trim(), email: String(raw).replace(/^.*<|>$/g, '').trim().toLowerCase() };
}

/** Normalize a users.threads.get(format=full) payload into app-shaped messages. */
export function parseThread(thread) {
  const messages = (thread.messages || []).map((m) => {
    const from = parseFrom(header(m, 'From'));
    const dateMs = Number(m.internalDate) || Date.now();
    return {
      external_id: m.id,
      from_name: from.name,
      from_email: from.email,
      to: header(m, 'To'),
      date: new Date(dateMs).toISOString(),
      body: bodyFromPayload(m.payload).slice(0, 20000),
      unread: Array.isArray(m.labelIds) ? m.labelIds.includes('UNREAD') : false,
      message_id_header: header(m, 'Message-ID') || null,
    };
  });
  const subject = (header(thread.messages?.[0] || {}, 'Subject') || '(no subject)').slice(0, 300);
  return { thread_id: thread.id, subject, messages };
}

/** Last Message-ID in a thread payload — used for RFC References/In-Reply-To so Gmail threads the reply. */
export function threadLastMessageId(thread) {
  const msgs = thread?.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const h = (msgs[i].payload?.headers || []).find((x) => x.name.toLowerCase() === 'message-id')?.value;
    if (h) return h;
  }
  return null;
}

export function buildRawReply({ from, to, subject, body, references }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    ...(references ? [`References: ${references}`, `In-Reply-To: ${references}`] : []),
    '',
    body,
  ];
  const raw = Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
  return raw;
}
