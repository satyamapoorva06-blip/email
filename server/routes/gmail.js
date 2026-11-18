// Gmail OAuth + sync routes.
//   GET  /api/gmail/status     — is Gmail configured? connected? last sync?
//   POST /api/gmail/connect    — returns the Google consent URL (ownership enforced)
//   GET  /api/gmail/callback   — OAuth redirect target (state-verified, no Bearer needed)
//   POST /api/gmail/sync       — import new threads (throttled; force=1 bypasses)
//   POST /api/gmail/disconnect — revoke + remove stored tokens
import { Router } from 'express';
import { get, run, all, nowIso, logActivity, ensureGmailColumns } from '../db.js';
import { authRequired } from '../auth.js';
import { googleConfig, gmailRedirectUri, buildAuthUrl, signState, verifyState, exchangeCode, revokeToken, gmailApi } from '../gmail/google.js';
import { encryptToken, decryptToken, tokenKeyConfigured } from '../gmail/crypto.js';
import { getGmailAccount, syncGmailForClient } from '../gmail/sync.js';

const router = Router();

// Resolve (and authorize) the target client for this user. Assistant → one of
// their clients; client → their own linked record. Returns clientId or an error.
async function authorizeClient(req, res) {
  let cid = req.body?.clientId ?? req.query?.clientId;
  if (cid == null || cid === '') {
    if (req.user.role === 'client') {
      const linked = await get('SELECT id FROM clients WHERE user_id = ?', req.user.id);
      cid = linked?.id;
    } else return { error: res.status(400).json({ error: 'Pass clientId.' }) };
  }
  cid = Number(cid);
  if (!Number.isInteger(cid) || !req.clientIds.includes(cid)) {
    return { error: res.status(403).json({ error: 'That mailbox belongs to another workspace.' }) };
  }
  return { clientId: cid };
}

// --- Status (safe to poll; no secrets, no tokens — just booleans + metadata)
router.get('/status', authRequired, async (req, res) => {
  const auth = await authorizeClient(req, res); if (auth.error) return;
  const cfg = googleConfig();
  let account = null;
  try { account = await getGmailAccount(auth.clientId); } catch (err) {
    return res.json({ configured: cfg.configured, connected: false, keyConfigured: tokenKeyConfigured(), error: err.message });
  }
  res.json({
    configured: cfg.configured,
    keyConfigured: tokenKeyConfigured(),
    connected: Boolean(account),
    email: account?.email || null,
    status: account?.status || null,
    last_synced_at: account?.last_synced_at || null,
    mode: account?.mode || null,
  });
});

// --- Begin OAuth (returns consent URL; frontend top-level-navigates to it)
router.post('/connect', authRequired, async (req, res) => {
  const auth = await authorizeClient(req, res); if (auth.error) return;
  const cfg = googleConfig();
  if (!cfg.configured) {
    return res.status(400).json({ error: 'Gmail OAuth is not configured on this deployment. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README → Gmail OAuth), or use the labelled demo mode.', code: 'not_configured' });
  }
  if (!tokenKeyConfigured()) {
    return res.status(500).json({ error: 'GMAIL_TOKEN_SECRET is not set — refusing to store OAuth tokens. Add a random 32+ char secret (see README) and redeploy.', code: 'no_token_key' });
  }
  const redirectUri = gmailRedirectUri(req);
  const state = signState({ uid: req.user.id, cid: auth.clientId, role: req.user.role });
  res.json({ url: buildAuthUrl({ state, redirectUri }) });
});

// --- OAuth callback (browser navigation — identity comes from the signed state)
router.get('/callback', async (req, res) => {
  const fail = (reason) => res.redirect(`/client?gmail=error&reason=${encodeURIComponent(reason)}`);
  try {
    const { code, state, error } = req.query;
    if (error) return fail(String(error).slice(0, 80));
    const parsed = verifyState(String(state || ''));
    if (!parsed) return fail('invalid_or_expired_state');
    const cfg = googleConfig();
    if (!cfg.configured) return fail('not_configured');
    const redirectUri = gmailRedirectUri(req);
    const tokens = await exchangeCode(String(code), redirectUri);
    if (!tokens.access_token) return fail('no_access_token');

    // Discover which Google account authorized (gmail.readonly covers the profile endpoint)
    const profile = await gmailApi.profile(tokens.access_token).catch(() => null);
    const email = String(profile?.emailAddress || '').toLowerCase();
    if (!email) return fail('profile_unavailable');

    await ensureGmailColumns();
    const refreshEnc = tokens.refresh_token ? encryptToken(tokens.refresh_token) : null;
    const expiry = new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString();

    const existing = await get(`SELECT id FROM connected_accounts WHERE client_id = ? AND provider = 'gmail' AND email = ?`, parsed.cid, email);
    if (existing) {
      await run(`UPDATE connected_accounts SET status = 'connected', mode = 'real', access_token_enc = ?,
                 refresh_token_enc = COALESCE(?, refresh_token_enc), token_expiry = ?, scope = ?, last_synced_at = NULL WHERE id = ?`,
        encryptToken(tokens.access_token), refreshEnc, expiry, tokens.scope || null, Number(existing.id));
    } else {
      await run(`INSERT INTO connected_accounts (client_id, provider, email, status, mode, last_synced_at, access_token_enc, refresh_token_enc, token_expiry, scope, created_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        Number(parsed.cid), 'gmail', email, 'connected', 'real', null,
        encryptToken(tokens.access_token), refreshEnc, expiry, tokens.scope || null, nowIso());
    }
    await logActivity(Number(parsed.cid), 'system', 'account_connected', `Gmail connected for ${email} (real OAuth).`);
    const dest = parsed.role === 'assistant' ? '/app/accounts' : '/client';
    return res.redirect(`${dest}?gmail=connected`);
  } catch (err) {
    console.error('[gmail/callback]', err.message);
    return fail('oauth_failed');
  }
});

// --- Sync now (throttled 90s unless force=1)
router.post('/sync', authRequired, async (req, res) => {
  const auth = await authorizeClient(req, res); if (auth.error) return;
  try {
    const account = await getGmailAccount(auth.clientId);
    if (!account) return res.status(400).json({ error: 'Gmail is not connected for this client. Connect it first.', code: 'not_connected' });
    const force = Boolean(req.body?.force);
    if (!force && account.last_synced_at && Date.now() - Date.parse(account.last_synced_at) < 90_000) {
      return res.json({ ok: true, skipped: true, reason: 'Synced less than 90 seconds ago.' });
    }
    const result = await syncGmailForClient(auth.clientId, { maxResults: 15 });
    res.json(result);
  } catch (err) {
    if (err.code === 'token_corrupt' || err.code === 'no_refresh_token') {
      return res.status(401).json({ error: `${err.message}`, code: err.code, reconnect: true });
    }
    const status = err.status === 401 || err.status === 403 ? 401 : 502;
    res.status(status).json({ error: `Gmail sync failed: ${err.message}`, code: err.code || 'sync_failed' });
  }
});

// --- Disconnect (revoke at Google, drop stored tokens)
router.post('/disconnect', authRequired, async (req, res) => {
  const auth = await authorizeClient(req, res); if (auth.error) return;
  const account = await getGmailAccount(auth.clientId);
  if (!account) return res.json({ ok: true, already: true });
  for (const col of ['refresh_token_enc', 'access_token_enc']) {
    try { const raw = decryptToken(account[col]); if (raw) await revokeToken(raw); } catch { /* best effort */ }
  }
  await run('DELETE FROM connected_accounts WHERE id = ?', account.id);
  await logActivity(auth.clientId, 'system', 'account_disconnected', `Gmail disconnected for ${account.email} (tokens revoked and removed).`);
  res.json({ ok: true });
});

export default router;
