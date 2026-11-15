// Smoke-render the built SPA in jsdom with a mocked /api backend.
// Catches runtime crashes in the initial render of key routes.
import { JSDOM } from 'jsdom';
import fs from 'node:fs';

const bundle = fs.readFileSync(new URL('../client/dist/assets/' + fs.readdirSync(new URL('../client/dist/assets', import.meta.url)).find((f) => f.endsWith('.js')), import.meta.url), 'utf8');
const css = '';

const ASSISTANT = { id: 1, name: 'Priya Sharma', email: 'priya@relay.app', role: 'assistant', avatar_color: '#4F46E5' };
const CLIENT_USER = { id: 2, name: 'Rahul Mehta', email: 'rahul@meridianventures.com', role: 'client', avatar_color: '#0F766E' };
const CONVO = (id, over = {}) => ({ id, client_id: 1, subject: `Test conversation ${id}`, classification: 'client', confidence: 0.9, summary: 'Summary here.', reason: 'Reason here.', suggested_action: 'Forward to client.', needs_review: false, status: 'open', is_read: false, is_starred: false, importance: 'high', approval_status: 'pending', approval_note: null, waiting_since: null, last_activity_at: new Date().toISOString(), created_at: new Date().toISOString(), client_name: 'Rahul Mehta', client_company: 'Meridian Ventures', client_color: '#0F766E', sender_name: 'Vikram Rao', sender_email: 'v@northgatelegal.com', preview: 'Preview…', last_direction: 'inbound', message_count: 2, attachment_count: 1, ...over });
const MESSAGES = [
  { id: 1, conversation_id: 1, sender_name: 'Vikram Rao', sender_email: 'v@northgatelegal.com', body: 'Term sheet attached for sign-off.', direction: 'inbound', created_at: new Date().toISOString(), attachments: [{ id: 1, message_id: 1, filename: 'TermSheet.pdf', size_bytes: 1000, kind: 'pdf' }] },
];

function apiMock(role) {
  const assistant = role === 'assistant';
  const table = [
    [/GET.*\/api\/auth\/me/, { user: assistant ? ASSISTANT : CLIENT_USER, clientId: 1 }],
    [/GET.*\/api\/stats/, { total: 24, unread: 13, needsAction: 9, clientAttention: 6, assistantToReply: 7, waiting: 4, important: 7 }],
    [/GET.*\/api\/clients/, { clients: [
      { id: 1, name: 'Rahul Mehta', company: 'Meridian Ventures', email: 'rahul@meridianventures.com', role_title: 'Managing Partner', avatar_color: '#0F766E', counts: { open: 13, unread: 5, attention: 5 }, accounts: [{ id: 1, provider: 'gmail', email: 'rahul.mehta@meridianventures.com', mode: 'simulated', last_synced_at: new Date().toISOString() }], login_email: 'rahul@meridianventures.com' },
      { id: 2, name: 'Anita Desai', company: 'Loom & Co.', email: 'anita@loomandco.com', role_title: 'Founder', avatar_color: '#B45309', counts: { open: 11, unread: 8, attention: 4 }, accounts: [], login_email: 'anita@loomandco.com' },
    ] }],
    [/GET.*\/api\/emails\?filter=important|filter=important/, { emails: [CONVO(1)] }],
    [/GET.*\/api\/emails\?[^/]*filter=waiting/, { emails: [CONVO(2, { classification: 'assistant', approval_status: 'none', importance: 'normal', waiting_since: new Date(Date.now() - 4 * 864e5).toISOString() })] }],
    [/GET.*\/api\/emails\/\d+$/, { conversation: CONVO(1), messages: MESSAGES, client: { id: 1, name: 'Rahul Mehta', company: 'Meridian Ventures', email: 'rahul@meridianventures.com', avatar_color: '#0F766E', role_title: 'Managing Partner' } }],
    [/GET.*\/api\/emails/, { emails: [CONVO(1), CONVO(2, { classification: 'none', approval_status: 'none', importance: 'low', is_read: true })] }],
    [/GET.*\/api\/meetings/, { meetings: [{ id: 1, client_id: 1, conversation_id: 1, title: 'Board dinner', start_at: new Date(Date.now() + 864e5).toISOString(), end_at: new Date(Date.now() + 864e5 + 45 * 6e4).toISOString(), location: 'The Oberoi', attendees: 'Rahul', source: 'extracted', client_name: 'Rahul Mehta', client_color: '#0F766E' }] }],
    [/GET.*\/api\/activity/, { activity: [{ id: 1, client_id: 1, client_name: 'Rahul Mehta', actor_role: 'ai', action: 'classified', detail: 'AI classified “Term sheet” as Client to reply.', created_at: new Date().toISOString() }] }],
    [/GET.*\/api\/notifications/, { notifications: [{ id: 1, title: 'Approval pending', body: 'Halcyon term sheet', read: false, created_at: new Date().toISOString() }], unread: 1 }],
    [/GET.*\/api\/accounts/, { accounts: [{ id: 1, client_id: 1, provider: 'gmail', email: 'rahul.mehta@meridianventures.com', status: 'connected', mode: 'simulated', last_synced_at: new Date().toISOString(), client_name: 'Rahul Mehta', client_company: 'Meridian Ventures', client_color: '#0F766E' }] }],
    [/GET.*\/api\/settings/, { settings: { signature: 'Warm regards', auto_classify: true, review_low_confidence: true, notify_high_importance: true, notify_client_actions: true, weekly_digest: false, timezone: 'Asia/Kolkata' } }],
    [/GET.*\/api\/client\/overview/, { client: { id: 1, name: 'Rahul Mehta', company: 'Meridian Ventures', email: 'rahul@meridianventures.com', avatar_color: '#0F766E' }, assistant: 'Priya Sharma', attention: [CONVO(1)], stats: { handled: 3, approvals: 1 } }],
    [/GET.*\/api\/client\/conversations\/\d+$/, { conversation: CONVO(1), messages: MESSAGES, client: { name: 'Rahul Mehta', company: 'Meridian Ventures' } }],
    [/GET.*\/api\/client\/conversations/, { conversations: [CONVO(1)], filtered: true }],
    [/GET.*\/api\/health/, { ok: true, ai: 'fallback' }],
    [/POST.*\/api\/auth\/logout/, { ok: true }],
  ];
  return async (url, opts = {}) => {
    const key = `${(opts.method || 'GET').toUpperCase()} ${url}`;
    for (const [re, body] of table) if (re.test(key)) return jsonResponse(body);
    return jsonResponse({ error: `smoke: unmocked ${key}` }, 404);
  };
}
const jsonResponse = (body, status = 200) => ({ body, status });

// Minimal XMLHttpRequest stand-in so axios (xhr adapter) works unchanged.
function makeFakeXHR(mockFetch) {
  return class FakeXHR {
    constructor() { this._l = {}; this.headers = {}; this.readyState = 0; this.status = 0; this.responseText = ''; this.responseURL = 'http://localhost/'; this.upload = { addEventListener() {}, removeEventListener() {} }; }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(k, v) { this.headers[k.toLowerCase()] = v; }
    set timeout(v) {} get timeout() { return 0; }
    set responseType(v) {} get responseType() { return ''; }
    addEventListener(ev, cb) { (this._l[ev] ||= []).push(cb); }
    removeEventListener(ev, cb) { this._l[ev] = (this._l[ev] || []).filter((f) => f !== cb); }
    getAllResponseHeaders() { return 'content-type: application/json\r\n'; }
    getResponseHeader(name) { return name.toLowerCase() === 'content-type' ? 'application/json' : null; }
    abort() {}
    send(body) {
      const run = async () => {
        const res = await mockFetch(this.url, { method: this.method, body });
        this.status = res.status;
        this.statusText = String(res.status);
        this.responseText = JSON.stringify(res.body);
        this.readyState = 4;
        this.onreadystatechange && this.onreadystatechange();
        for (const cb of this._l.loadend || []) cb({ target: this });
        for (const cb of this._l.load || []) cb({ target: this });
      };
      run().catch((err) => { for (const cb of this._l.error || []) cb(err); this.onerror && this.onerror(err); });
    }
  };
}

const routes = [
  { path: '/', name: 'Landing' },
  { path: '/login', name: 'Login' },
  { path: '/register', name: 'Register' },
  { path: '/app', name: 'Overview', role: 'assistant' },
  { path: '/app/emails?filter=client', name: 'Emails(client)', role: 'assistant' },
  { path: '/app/emails?filter=archived', name: 'Archived', role: 'assistant' },
  { path: '/app/email/1', name: 'EmailDetail', role: 'assistant' },
  { path: '/app/meetings', name: 'Meetings', role: 'assistant' },
  { path: '/app/accounts', name: 'Accounts', role: 'assistant' },
  { path: '/app/clients', name: 'ClientsRoster', role: 'assistant' },
  { path: '/app/activity', name: 'Activity', role: 'assistant' },
  { path: '/app/settings', name: 'Settings', role: 'assistant' },
  { path: '/app/help', name: 'Help', role: 'assistant' },
  { path: '/client', name: 'ClientHome', role: 'client' },
  { path: '/client/email/1', name: 'ClientReview', role: 'client' },
  { path: '/client/all', name: 'ClientAllMail', role: 'client' },
];

let failures = 0;
for (const route of routes) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url: `http://localhost${route.path}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const mock = apiMock(route.role);
  window.XMLHttpRequest = makeFakeXHR(mock);
  window.fetch = (...args) => mock(...args).then((r) => ({ ok: r.status < 300, status: r.status, json: async () => r.body, text: async () => JSON.stringify(r.body), headers: { get: () => 'application/json' } }));
  window.localStorage.setItem('relay_token', 'smoke-token');
  if (route.role) window.localStorage.setItem('relay_user', JSON.stringify(route.role === 'assistant' ? ASSISTANT : CLIENT_USER));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  global.window = window; global.document = window.document;
  try { Object.defineProperty(global, 'navigator', { value: window.navigator, configurable: true }); } catch { /* node already defines it */ }
  global.localStorage = window.localStorage; global.fetch = window.fetch; global.self = window;
  window.console.error = (...args) => { console.error(`  [${route.name}]`, ...args); };

  try {
    window.eval(bundle);
    await new Promise((r) => setTimeout(r, 350));
    const html = window.document.getElementById('root').innerHTML;
    const ok = html.includes('Relay') || html.includes('relay') || html.includes('Every email');
    const looksEmpty = html.replace(/<[^>]*>/g, '').trim().length < 20;
    if (!ok || looksEmpty) { failures++; console.log(`✗ ${route.name}: rendered suspiciously little (${html.length} chars)`); }
    else console.log(`✓ ${route.name} (${html.length} chars)`);
    if (process.env.SMOKE_DEBUG) console.log(`   [${route.name}] text:`, (window.document.body.textContent || '').replace(/\s+/g, ' ').slice(0, 500));
  } catch (err) {
    failures++;
    console.log(`✗ ${route.name}: threw — ${err.message}`);
  }
}
process.exit(failures ? 1 : 0);
