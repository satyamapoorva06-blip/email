// Database layer — SQLite via Node's built-in node:sqlite (zero native deps).
// The schema is intentionally simple and portable; it could be swapped for
// Postgres/MongoDB by re-implementing the query helpers below.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'relay.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT,                       -- 'assistant' | 'client' | NULL (chosen during onboarding)
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
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,   -- linked client login, if any
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  email TEXT NOT NULL,                                        -- primary mailbox shown in UI
  role_title TEXT DEFAULT 'Client',
  avatar_color TEXT DEFAULT '#0F766E',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,             -- 'gmail' | 'outlook'
  email TEXT NOT NULL,
  status TEXT DEFAULT 'connected',    -- 'connected' | 'error'
  mode TEXT DEFAULT 'simulated',      -- 'simulated' (demo OAuth) | 'real' (production OAuth)
  last_synced_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'assistant',  -- 'assistant' | 'client' | 'none'
  confidence REAL NOT NULL DEFAULT 0.9,
  summary TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  suggested_action TEXT DEFAULT '',
  needs_review INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',               -- 'open' | 'completed' | 'archived'
  is_read INTEGER NOT NULL DEFAULT 0,
  is_starred INTEGER NOT NULL DEFAULT 0,
  importance TEXT NOT NULL DEFAULT 'normal',         -- 'high' | 'normal' | 'low'
  approval_status TEXT NOT NULL DEFAULT 'none',      -- 'none' | 'pending' | 'approved' | 'rejected'
  approval_note TEXT,
  waiting_since TEXT,               -- set when we're awaiting an external reply (follow-up reminders)
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  body TEXT NOT NULL,
  direction TEXT NOT NULL,          -- 'inbound' | 'outbound'
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  kind TEXT DEFAULT 'file'          -- 'pdf' | 'doc' | 'sheet' | 'image' | 'file'
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL,         -- 'assistant' | 'client' | 'ai' | 'system'
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
  source TEXT DEFAULT 'extracted',  -- 'extracted' (from an email) | 'manual'
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

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_activity_client ON activity_log(client_id, created_at);
`);

// ---- Small query helpers (kept deliberately simple) ----
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export const nowIso = () => new Date().toISOString();

// Insert an activity entry and return it.
export function logActivity(clientId, actorRole, action, detail) {
  run(
    `INSERT INTO activity_log (client_id, actor_role, action, detail, created_at) VALUES (?,?,?,?,?)`,
    clientId, actorRole, action, detail, nowIso()
  );
}

// Notify every assistant watching a client (i.e. the owner).
export function notifyAssistants(clientId, title, body) {
  const client = get('SELECT assistant_id FROM clients WHERE id = ?', clientId);
  if (!client) return;
  run(
    `INSERT INTO notifications (user_id, title, body, created_at) VALUES (?,?,?,?)`,
    client.assistant_id, title, body || '', nowIso()
  );
}
