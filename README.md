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

The SQLite database is created and seeded automatically on first boot
(2 clients, 24 conversations, meetings, activity history, notifications).
To rebuild demo data at any time: `npm run seed`.

### Development mode

```bash
npm run dev:server   # API on :3001 (watched manually)
npm run dev:client   # Vite dev server on :5173 with /api proxy → :3001
```

### Demo-data caveats

- Gmail/Outlook connects are **simulated** (no real provider credentials are
  configured) and are labelled "Simulated" everywhere in the UI.
- All “send” buttons **simulate sending** — messages are stored and threaded,
  but no email leaves the system.
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
scripts/smoke.mjs     # jsdom smoke-render of every route (npm i --no-save jsdom)
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
| `GOOGLE_CLIENT_ID` / `MICROSOFT_CLIENT_ID` | Real OAuth for Gmail/Outlook     | Connections stay labelled simulated |

Going to real OAuth: register an OAuth client with Google/Microsoft, set the
env vars, and replace the simulated consent in `AssistantConnect.jsx` /
`ConnectedAccounts.jsx` with the provider’s standard auth-code flow — the rest
of the app (tokens at rest, sync bookkeeping) already stores against accounts
with `mode='real'`.

## Deployment

The app is a single Node process: `npm install && npm run build && npm start`.
Deploy to any Node host (Render, Railway, Fly.io) with a persistent disk mounted
at `data/` (or set your own `DATA` dir in `server/db.js`). Vercel works for the
static client, but the Express API needs a Node runtime; do not deploy the API
to serverless functions as-is — SQLite on ephemeral filesystems will lose data.

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
and a single `db.js` seam. The smoke suite (`node scripts/smoke.mjs` with
`npm i --no-save jsdom`) render-checks every route under a mocked API.
