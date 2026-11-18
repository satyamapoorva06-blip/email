# Relay — AI Email Operations for Personal Assistants

> The inbox that decides who replies.

Relay is a full-stack SaaS application for executive personal assistants who manage
multiple client inboxes. Every incoming conversation is classified as
**Assistant to reply**, **Client to reply**, **No reply needed**, or flagged for
human **review** — always with a confidence score, a written explanation and a
suggested next action. Assistants get a complete operations dashboard; clients get a
separate, radically simple surface showing only what needs their decision.

![stack](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite%20%2B%20Tailwind-4F46E5)

---

## Quick start

```bash
npm install
npm run build      # builds the React client into client/dist
npm start          # serves API + built client on http://localhost:3001
```

Open **http://localhost:3001** and sign in with a demo account (all passwords `demo1234`):

| Role     | Account                        | Lands on                |
|----------|--------------------------------|-------------------------|
| Assistant| `priya@relay.app`              | Full triage workspace   |
| Client   | `rahul@meridianventures.com`   | Client decisions only   |
| Client   | `anita@loomandco.com`          | Client decisions only   |
| Client   | `amansatyam408@gmail.com`      | Client decisions only — primary personal demo client |

The SQLite database is created and seeded automatically on first boot
(3 clients, sample conversations, meetings, activity history, notifications).
To rebuild demo data at any time: `npm run seed`.

### Development mode

```bash
npm run dev:server   # API on :3001 (watched manually)
npm run dev:client   # Vite dev server on :5173 with /api proxy → :3001
```

### Demo-data caveats

- Gmail/Outlook connects are **simulated** until you configure provider OAuth
  (see *Gmail OAuth setup* below). When `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  are set, “Connect Gmail” runs the real Google OAuth 2.0 flow and inbox threads
  sync into Relay; without them, connections stay labelled "Simulated".
- "Send" buttons simulate sending only for **simulated** threads. Replies on
  **real Gmail threads** are delivered through the Gmail API and only ever on
  an explicit user click — nothing is sent without approval.
- AI classification runs on a transparent **rule-based fallback engine** by
  default (see below). Set `OPENAI_API_KEY` to switch to a real LLM.

---

## What’s inside

### Assistant workspace (`/app`)
- **Overview** — greeting, total/unread/needs-action/client-attention stats,
  priority inbox, recent conversations, pending responses, upcoming meetings,
  recent activity.
- **Email queues** — All, Assistant to Reply, Client to Reply, No Reply Needed,
  Action Required, Waiting for Response (follow-ups), Important, Archived.
- **List view** — search (`/` or `⌘K`), sort, unread filter, star, read/unread,
  archive, complete, delete (with confirmation), multi-select + bulk actions.
- **Conversation view** — full thread + attachments, AI summary, *why* it was
  classified, suggested next action, editable classification override,
  re-analyze on latest history, meeting extraction, and a composer with
  **AI-drafted replies that are never auto-sent**.
- **Meetings** — dates extracted from threads (LLM or heuristic) + manual add.
- **Clients** — multiple client management, per-client workspaces, one-time
  credential hand-off for client logins.
- **Activity timeline** — every AI classification, override, client action and
  sent reply; filterable by actor.
- **Ask AI panel** — answers from live inbox data (counts, lists, meetings,
  draft generation, "why this classification?") with suggested prompts.

### Client surface (`/client`)
- Only open threads that need **the client**: no assistant clutter, no newsletters.
- Review the thread with the AI’s reasoning, then **Approve** / **Reject**
  (when an approval is requested), **Mark handled**, or **Ask the assistant to
  handle** (with an optional note). All actions hit the same database the
  assistant watches — their workspace and notifications update instantly.
- “Show everything” is an explicit opt-in to the raw mailbox.

### AI engine — honest and layered
`server/ai/` contains three clearly separated pieces:

1. `llm.js` — OpenAI-compatible Chat Completions (any `OPENAI_BASE_URL`),
   strict JSON responses, timeout + full failure tolerance.
2. `fallback.js` — deterministic, transparent rule scorer (keyword/regex
   signals, weighted, ambiguity detection). Matched signals are surfaced in
   the explanation (“Matched client-decision language: term sheet, signature
   request…”), never hidden.
3. `classify.js` / `assistant.js` — orchestration + the conversational panel.
   LLM everywhere it adds value (classification, drafts, chat), with automatic
   fallback to the rule engine on **any** error. The UI labels which engine
   answered (“LLM” vs “Rules” / “Answered from live data”).

Low-confidence results (<60%) are flagged **Needs review** instead of guessed.

---

## Architecture

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│ React SPA (client/)      │  HTTP  │ Express API (server/)          │
│  ├─ Assistant workspace  │ ─────► │  ├─ routes/ (thin, validated)   │
│  └─ Client surface       │  JSON  │  ├─ ai/ (llm · fallback · chat) │
└──────────────────────────┘        │  ├─ db.js (SQLite, WAL)        │
                                    │  └─ seed.js (realistic demo)   │
                                    └───────────────────────────────┘
```

- **Single origin in production**: Express serves `client/dist` + `/api/*`.
- **Persistence**: embedded SQLite via Node’s built-in `node:sqlite`
  (zero native dependencies). The spec’s preferred MongoDB/Mongoose isn’t used
  because this environment has no route to a Mongo host; SQLite is a proper
  persistent storage layer, and the data access is confined to `server/db.js`
  (small query helpers: `all/get/run`), which is the single seam to port to
  Postgres/Mongo — swap that file and the schema.
- **Auth**: email + scrypt-hashed passwords, opaque session tokens
  (`sessions` table, 30-day expiry), `Authorization: Bearer` on every call.
  Client users can never read assistant endpoints (role check + per-client
  scoping enforced server-side — not just hidden in the UI).
- **No secrets in the frontend.** Everything sensitive lives in environment
  variables, and the demo works with none of them set.

### Folder structure

```
server/
  index.js            # boot: seed-if-empty, wire routes, serve client/dist
  db.js               # schema + tiny query helpers (the port seam)
  auth.js             # scrypt hashing, sessions, role/scope middleware
  seed.js             # realistic demo data (run: npm run seed)
  ai/                 # llm.js · fallback.js · classify.js · assistant.js
  routes/             # auth · emails · client · clients · overview · ops · ai
client/
  index.html          # Inter font, favicon, meta
  tailwind.config.js  # design tokens: brand indigo, hairline #E8E8EC, warm app bg
  src/
    api.js            # one axios instance (auth header + 401 → /login)
    context.jsx       # AuthProvider + ToastProvider
    workspace.jsx     # assistant’s active client (“workspace”) + nav counts
    utils.js          # dates, initials, file sizes
    components/       # Sidebar · TopBar · AIPanel · EmailList · EmailRow ·
                      # MessageThread (shared) · badges · Modal · EmptyState · …
    pages/
      assistant/      # Overview · EmailsPage · EmailDetail · Meetings ·
                      # ConnectedAccounts · ClientsRoster · Activity · Settings · Help
      client/         # ClientHome · ClientReview · ClientAllMail
      Landing · Login · Register · RoleSelect · AssistantConnect
scripts/smoke.mjs     # jsdom smoke-render of every route (node scripts/smoke.mjs)
scripts/pg-dump.mjs   # regenerate seed SQL for hosted Postgres from server/seed.js
```

### API surface (all JSON, all scoped to the caller)

`POST /api/auth/register|login|logout` · `GET /api/auth/me` · `PUT /api/auth/role|profile`
`GET /api/emails?filter|search|sort|clientId` · `GET /api/emails/:id`
`POST /api/emails/:id/read|star|archive|complete|reply|reanalyze|generate-reply|extract-meeting`
`PUT /api/emails/:id/classification` · `DELETE /api/emails/:id` · `POST /api/emails/bulk`
`GET /api/client/overview|conversations[/:id]` · `POST /api/client/conversations/:id/action|approval`
`GET /api/stats|/activity|/meetings` · `POST /api/meetings` · `DELETE /api/meetings/:id`
`GET /api/accounts` · `POST /api/accounts/connect|/sync` · `DELETE /api/accounts/:id`
`GET|PUT /api/settings` · `GET /api/notifications` · `POST /api/notifications/read`
`POST /api/ai/chat` · `GET /api/health`

---

## Environment variables

Copy `.env.example` → `.env`. Everything is optional:

| Variable           | Purpose                                             | Without it                        |
|--------------------|-----------------------------------------------------|-----------------------------------|
| `PORT`             | API/static port (default 3001)                      | 3001                              |
| `OPENAI_API_KEY`   | Enables real LLM classification, drafts, chat        | Transparent rule-based engine     |
| `OPENAI_BASE_URL`  | Any OpenAI-compatible endpoint                       | api.openai.com                    |
| `OPENAI_MODEL`     | Model name                                          | gpt-4o-mini                       |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Real Gmail OAuth 2.0            | Gmail connects stay labelled simulated |
| `GMAIL_TOKEN_SECRET` | AES-256-GCM key for stored OAuth tokens (required in prod) | Server refuses to store tokens |
| `GMAIL_REDIRECT_URI` | Explicit OAuth redirect override  | Defaults to `<origin>/api/gmail/callback` |
| `MICROSOFT_CLIENT_ID` | Outlook OAuth (not yet implemented) | Outlook stays simulated |

## Gmail OAuth setup (real inbox)

1. Google Cloud Console → create/select a project → **APIs & Services → Library** → enable **Gmail API**.
2. **OAuth consent screen**: External. Add scopes `gmail.readonly`, `gmail.modify`, `gmail.send` (all Restricted; for personal use keep the app in *Testing* and add your address as a **test user** — no Google verification needed for ≤100 test users).
3. **Credentials → Create credentials → OAuth client ID → Web application.** Authorized redirect URIs:
   - `http://localhost:3001/api/gmail/callback`
   - `https://relay-email-assistant.vercel.app/api/gmail/callback` (and your project alias if you use it)
4. Set on Vercel (Project → Settings → Environment Variables, **server-side only**, never `VITE_*`):
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GMAIL_TOKEN_SECRET` (`openssl rand -hex 32`), and optionally `GMAIL_REDIRECT_URI` (recommended: the exact public callback URL).
   For local dev, put the same in `.env`.
5. Redeploy. Open **Connected Accounts** → pick Aman Satyam → **Connect Gmail** → authorize. Tokens are stored AES-256-GCM-encrypted in Postgres; the browser never sees them. **Disconnect** revokes them at Google and deletes the stored copy.
6. Real threads import into the client's workspace labelled with your Gmail threading, classified by the configured AI engine (fallback rules without a key). Mark-read/archive sync back to Gmail; replies deliver via Gmail only on explicit Send.

Outlook remains simulated — the Outlook OAuth flow is not implemented.

## Deployment

**As configured: Vercel (static client + serverless API) + Supabase (Postgres).**

- Vercel project `relay-email-assistant` (team `satyamapoorva06-blips-projects`) — linked to
  `satyamapoorva06-blip/email`. `vercel.json` uses explicit **v2 builds** because the
  zero-config `api/` detection did NOT produce a Serverless Function under the Vite
  framework preset (every `/api/*` fell through to a platform 404 while the SPA kept
  serving). The v2 config builds `@vercel/static-build` (`npm run build` → `client/dist`)
  and `@vercel/node` (`api/[...slug].js`, the same Express app, never listens) and routes
  `/api/*` to the function, static assets from the filesystem, and everything else to the
  SPA bundle. Do not reintroduce `outputDirectory`/`framework` overrides that bypass this.
- Supabase project `relay-email-assistant` (ref `jbmeyrisolxcsdmxykcx`, region `ap-south-1`) —
  schema applied via migration `relay_schema` (11 tables + indexes; **RLS enabled on every
  table**, no policies → only the server-side service path can read/write; the anon key
  cannot). Demo dataset (28 conversations, 34 messages, 6 meetings) loaded 2026-11-15.
- `DATABASE_URL` (sensitive env var on Vercel, production + preview) points at the Supabase
  **transaction pooler**, port 6543 — serverless-safe. `postgres.js` runs with
  `prepare: false` as required by PgBouncer.
- Import-time work: the Postgres backend applies **no** DDL at module import (a failed
  cold-start would take down every route). The schema is owned by migrations; the
  connection is opened lazily on first query.

Deploys: pushes to `arena/3ff46f48-email` do **not** auto-deploy (project has git
auto-deploy disabled); trigger one with Vercel → Create Deployment → branch
`arena/3ff46f48-email`, or via the API with the branch HEAD SHA. First deploy on a brand
new project requires the manual projectSettings step described in the previous revision of
this section.

Afterwards, verify: `GET /api/health` should report `{"ok":true,"db":"postgres","reachable":true}`.
If `reachable` is `false`, the pooler shard hostname is off for this project — swap the
`aws-0-ap-south-1` part of `DATABASE_URL` to `aws-1-ap-south-1` (Project → Settings → Environment
Variables), then redeploy. If the site shows a Vercel login wall, disable Vercel
Deployment Protection for production (Project → Settings → Deployment Protection) or attach
a custom domain.

**Always works, zero config:** any Node host with a persistent disk —
`npm install && npm run build && npm start` (Render/Railway/Fly/Docker). The app then uses
the embedded SQLite file at `data/relay.db` (auto-created and seeded on first boot).

`pglite://memory` (or `pglite:///tmp/dir`) as `DATABASE_URL` runs the full app on an in-process WASM Postgres for local E2E testing of the Postgres code path (`@electric-sql/pglite` is a dev dependency).

### Redeploying the database

Schema changes ship as Supabase migrations (see migration `relay_schema`). The demo dataset
is reproducible: `node scripts/pg-dump.mjs > seed.sql` regenerates the seed from
`server/seed.js`, applicable with any SQL client. `npm run seed --force` rebuilds the local
SQLite demo database at any time.

## Security notes

- Passwords: `scrypt` + per-user salt, timing-safe compare.
- Sessions: opaque 256-bit tokens, server-side expiry, cascade delete.
- Role checks (`assistantOnly` / `clientOnly`) + per-client scoping on **every**
  query — client logins cannot enumerate assistant data.
- Input validation server-side on all mutating routes; parameterised queries
  throughout (no string-concatenated SQL).
- Attachments in the demo are generated client-side placeholders; no file
  upload endpoint exists yet.

## Code quality

Simple, explicit, commented where the logic is non-obvious. No hidden magic:
one axios instance, one fetch wrapper per AI path, tiny reusable components,
and a single `db.js` seam. The smoke suite (`node scripts/smoke.mjs`) render-checks every route under a
mocked API (jsdom is a dev dependency).
