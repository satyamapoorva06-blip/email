// Database layer — one async API, two backends:
//
//   • no DATABASE_URL                     → embedded SQLite via node:sqlite (default; local demo)
//   • DATABASE_URL=postgres://…           → PostgreSQL (production; a Supabase pooler URL works)
//   • DATABASE_URL=pglite://memory|<dir>  → in-process Postgres for local/dev E2E checks
//                                            (dev-only; requires @electric-sql/pglite, not a dependency)
//
// Why TEXT timestamps everywhere instead of timestamptz: every comparison in this
// codebase is against JS-generated ISO-8601 strings, which compare correctly as
// text in both engines. The schema stays character-for-character compatible.
//
// Parameter style everywhere: `?` positional placeholders (converted to $1..$n on
// the Postgres backends). All helpers are async so the whole codebase can use one
// calling convention regardless of backend.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATABASE_URL = process.env.DATABASE_URL || '';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- schema
// TEXT columns + INTEGER 0/1 flags keep both engines semantically identical.
const TABLES = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT,
  avatar_color TEXT DEFAULT '#4F46E5',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assistant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,
  role_title TEXT DEFAULT 'Client',
  avatar_color TEXT DEFAULT '#0F766E',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connected_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'connected',
  mode TEXT DEFAULT 'simulated',
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'assistant',
  confidence REAL NOT NULL DEFAULT 0.9,
  summary TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  suggested_action TEXT DEFAULT '',
  needs_review INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  importance TEXT NOT NULL DEFAULT 'normal',
  approval_status TEXT NOT NULL DEFAULT 'none',
  approval_note TEXT,
  waiting_since TEXT,
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  kind TEXT DEFAULT 'file'
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  location TEXT DEFAULT '',
  attendees TEXT DEFAULT '',
  source TEXT DEFAULT 'extracted',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  signature TEXT DEFAULT '',
  auto_classify INTEGER DEFAULT 1,
  review_low_confidence INTEGER DEFAULT 1,
  notify_high_importance INTEGER DEFAULT 1,
  notify_client_actions INTEGER DEFAULT 1,
  weekly_digest INTEGER DEFAULT 0,
  timezone TEXT DEFAULT 'Asia/Kolkata'
);
`;

const SQLITE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_id, created_at);
`;

// SQLite → Postgres DDL translation (kept next to the SQLite DDL on purpose).
export const PG_DDL =
  TABLES.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY')
    .replace(/\bREAL\b/g, 'DOUBLE PRECISION') +
  SQLITE_INDEXES;

// ------------------------------------------------------------- backends
// Translate `?` placeholders to Postgres $1..$n, skipping single-quoted literals
// ('' is an escaped quote inside a literal).
function translate(sql) {
  let out = '';
  let i = 0, n = 0, inString = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += sql[i + 1]; i += 2; continue; }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'") { inString = true; out += ch; i += 1; continue; }
    if (ch === '?') { n += 1; out += '$' + n; i += 1; continue; }
    out += ch;
    i += 1;
  }
  return out;
}

// Deep-map driver results: Postgres int8 arrives as BigInt depending on the
// driver; JavaScript JSON and call sites expect numbers (counts) or strings.
function normalize(value) {
  if (typeof value === 'bigint') return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = normalize(value[key]);
    return out;
  }
  return value;
}

// Tables without an `id` column — INSERT ... RETURNING id would be invalid there.
const NO_ID_TABLES = new Set(['settings', 'sessions']);

function isInsert(sql) {
  return /^\s*insert\s+into\s+([a-z_][a-z0-9_]*)/i.exec(sql);
}

async function makeSqliteBackend() {
  const { DatabaseSync } = await import('node:sqlite');
  const DATA_DIR = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, 'relay.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(TABLES);
  db.exec(SQLITE_INDEXES);
  return {
    all: async (sql, params) => db.prepare(sql).all(...params),
    get: async (sql, params) => db.prepare(sql).get(...params),
    run: async (sql, params) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    exec: async (sql) => db.exec(sql),
  };
}

async function makePostgresBackend(url) {
  const { default: postgres } = await import('postgres');
  // NOTE: no I/O here. The constructor is lazy, and schema DDL must never run
  // at module import — a failed cold-start would take down EVERY route with a
  // platform 500. The schema lives in migrations (see README / Supabase
  // migration `relay_schema`); the pooler is reached lazily on first query.
  const sql = postgres(url, { prepare: false, max: 3, connect_timeout: 15, idle_timeout: 20 });
  const query = async (text, params) => sql.unsafe(translate(text), params ?? []);
  return {
    all: async (text, params) => normalize([...(await query(text, params))]),
    get: async (text, params) => normalize((await query(text, params))[0]),
    run: async (text, params) => {
      const insert = isInsert(text);
      let q = translate(text);
      // Surface the generated id so existing call sites keep working.
      // (settings has no id column; it never uses lastInsertRowid.)
      if (insert && !/returning/i.test(q) && !NO_ID_TABLES.has(insert[1].toLowerCase())) q += ' RETURNING id';
      const rows = await sql.unsafe(q, params ?? []);
      const id = rows[0]?.id;
      return { lastInsertRowid: id == null ? 0 : Number(id), changes: insert ? Number(rows.count ?? rows.length ?? 1) : Number(rows.count ?? 0) };
    },
    exec: async (text) => { await sql.unsafe(text); },
  };
}

async function makePgliteBackend() {
  // Dev-only: real Postgres semantics in-process (WASM). Not a dependency.
  const { PGlite } = await import('@electric-sql/pglite');
  const target = DATABASE_URL.replace(/^pglite:\/\//, '');
  const db = !target || target === 'memory' ? new PGlite() : new PGlite(target);
  await db.exec(PG_DDL);
  return {
    all: async (text, params) => normalize((await db.query(translate(text), params ?? [])).rows),
    get: async (text, params) => normalize((await db.query(translate(text), params ?? [])).rows[0]),
    run: async (text, params) => {
      const insert = isInsert(text);
      let q = translate(text);
      if (insert && !/returning/i.test(q) && !NO_ID_TABLES.has(insert[1].toLowerCase())) q += ' RETURNING id';
      const res = await db.query(q, params ?? []);
      const id = res.rows[0]?.id;
      return { lastInsertRowid: id == null ? 0 : Number(id), changes: Number(res.affectedRows ?? res.rows.length ?? 1) };
    },
    exec: async (text) => { await db.exec(text); },
  };
}

const backend = DATABASE_URL.startsWith('pglite://')
  ? await makePgliteBackend()
  : DATABASE_URL
    ? await makePostgresBackend(DATABASE_URL)
    : await makeSqliteBackend();

// ------------------------------------------------------- query helpers
export const all = (sql, ...params) => backend.all(sql, params);
export const get = (sql, ...params) => backend.get(sql, params);
export const run = (sql, ...params) => backend.run(sql, params);
export const exec = (sql) => backend.exec(sql);

export const HAS_POSTGRES = Boolean(DATABASE_URL);
export const nowIso = () => new Date().toISOString();

// Insert an activity entry.
export async function logActivity(clientId, actorRole, action, detail) {
  await run(
    `INSERT INTO activity_log (client_id, actor_role, action, detail, created_at) VALUES (?,?,?,?,?)`,
    clientId, actorRole, action, detail, nowIso()
  );
}

// Notify every assistant watching a client (i.e. the owner).
export async function notifyAssistants(clientId, title, body) {
  const client = await get('SELECT assistant_id FROM clients WHERE id = ?', clientId);
  if (!client) return;
  await run(
    `INSERT INTO notifications (user_id, title, body, created_at) VALUES (?,?,?,?)`,
    client.assistant_id, title, body || '', nowIso()
  );
}
