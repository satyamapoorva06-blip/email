// Connected accounts — clearly labelled simulated demo connections by default.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plug2, Check, RefreshCw, Trash2, Info, Link2, Mail, ShieldCheck } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import { Modal, ConfirmModal } from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { timeAgo } from '../../utils';

const providerMark = (provider) => provider === 'gmail' ? (
  <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="#EA4335" d="M4.4 6h15.2c.6 0 1 .5 1 .9v1L12 13.4 3.4 7.9v-1c0-.5.4-.9 1-.9z"/><path fill="#FBBC05" d="M3.4 7.9L12 14l8.6-6.1V18a1.6 1.6 0 01-1.6 1.6H5A1.6 1.6 0 013.4 18z" opacity="0.95"/></svg>
) : (
  <svg viewBox="0 0 24 24" className="w-5 h-5"><rect x="2.5" y="5" width="12" height="14" rx="1.8" fill="#0A6ED1"/><path fill="#28A8E8" d="M14.5 9.2l7-2.4v10.4l-7-2.4z"/></svg>
);

export default function ConnectedAccounts() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(null);
  const [modal, setModal] = useState(null); // { provider, clientId } or null
  const [email, setEmail] = useState('');
  const [disconnecting, setDisconnecting] = useState(null);
  const [gmailStatus, setGmailStatus] = useState({}); // clientId -> status payload
  const [searchParams, setSearchParams] = useSearchParams();

  // Surface the OAuth redirect outcome (?gmail=connected|error) exactly once.
  useEffect(() => {
    const g = searchParams.get('gmail');
    if (!g) return;
    if (g === 'connected') toast('Gmail connected — real mailbox linked. Use “Sync now” to import threads.');
    else toast(`Gmail connection failed${searchParams.get('reason') ? ` (${searchParams.get('reason')})` : ''}. Nothing was stored.`, 'error');
    searchParams.delete('gmail'); searchParams.delete('reason'); setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([api.get('/api/accounts'), api.get('/api/clients')]);
      setAccounts(a.data.accounts);
      setClients(c.data.clients);
      const statuses = await Promise.all(
        c.data.clients.map((cl) => api.get('/api/gmail/status', { params: { clientId: cl.id } }).then((r) => [cl.id, r.data]).catch(() => [cl.id, null]))
      );
      setGmailStatus(Object.fromEntries(statuses));
    } catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const sync = async (account) => {
    setSyncing(account.id);
    try {
      if (account.mode === 'real') {
        const { data } = await api.post('/api/gmail/sync', { clientId: account.client_id, force: true });
        toast(`Gmail sync complete — ${data.imported ?? 0} new, ${data.updated ?? 0} updated.`);
      } else {
        await api.post(`/api/accounts/${account.id}/sync`);
        toast('Mailbox synced (simulated).');
      }
      await load();
    } catch (err) { toast(err.message, 'error'); load(); } finally { setSyncing(null); }
  };

  const connect = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await api.post('/api/accounts/connect', { clientId: modal.clientId, provider: modal.provider, email: email.trim() });
      toast('Mailbox connected (simulated demo).');
      setModal(null); setEmail('');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const connectWithGoogle = async () => {
    try {
      const { data } = await api.post('/api/gmail/connect', { clientId: modal.clientId });
      window.location.assign(data.url);
    } catch (err) { toast(err.message, 'error'); }
  };

  const disconnect = async () => {
    try {
      if (disconnecting.mode === 'real') {
        await api.post('/api/gmail/disconnect', { clientId: disconnecting.client_id });
        toast('Gmail disconnected — tokens revoked and deleted.');
      } else {
        await api.delete(`/api/accounts/${disconnecting.id}`);
        toast('Mailbox disconnected.');
      }
      load();
    } catch (err) { toast(err.message, 'error'); }
    setDisconnecting(null);
  };

  const grouped = clients.map((c) => ({ client: c, accounts: accounts.filter((a) => a.client_id === c.id) }));

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><Plug2 size={19} className="text-brand-600" /> Connected Accounts</h1>
      <p className="mt-1 text-[12px] text-ink-secondary">Mailboxes Relay reads on your clients’ behalf — never stored, always scoped.</p>

      <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-[11.5px] leading-snug text-[#92400E]">
        <Info size={15} className="shrink-0 mt-0.5" />
        <span><strong>Two modes.</strong> If <code className="font-mono text-[10px] bg-white/70 px-1 rounded">GOOGLE_CLIENT_ID</code> / <code className="font-mono text-[10px] bg-white/70 px-1 rounded">GOOGLE_CLIENT_SECRET</code> are set, “Connect Gmail” runs the real Google OAuth flow — tokens are stored encrypted on the server and revocable anytime. Without them, connections are clearly labelled <em>Simulated</em> demos and no real mail is accessed. See README → Gmail OAuth.</span>
      </div>

      <div className="mt-5 space-y-4">
        {loading && [0, 1].map((i) => <div key={i} className="h-40 rounded-xl bg-[#F0F0F3] animate-pulse" />)}
        {!loading && grouped.length === 0 && <EmptyState icon={Mail} title="No clients yet" body="Add a client first, then connect their mailboxes." />}
        {grouped.map(({ client, accounts: list }) => (
          <section key={client.id} className="card overflow-hidden">
            <header className="flex items-center gap-2.5 px-4 sm:px-5 h-12 border-b border-hairline bg-[#FCFCFD]">
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold" style={{ background: client.avatar_color }}>{client.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</div>
              <div className="min-w-0"><p className="text-[13px] font-bold text-ink leading-tight">{client.name}</p><p className="text-[10px] text-ink-muted leading-tight">{client.company}</p></div>
              <div className="ml-auto flex items-center gap-1.5">
                <button className="btn-secondary !h-8 !px-2.5 !text-[11.5px]" onClick={() => setModal({ provider: 'gmail', clientId: client.id })}><Link2 size={13} /> Connect</button>
              </div>
            </header>
            <div className="divide-y divide-hairline">
              {list.length === 0 && <p className="px-5 py-4 text-[12px] text-ink-muted">No mailboxes connected for {client.name.split(' ')[0]} yet.</p>}
              {list.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5" data-mode={a.mode}>
                  <span className="w-9 h-9 rounded-lg bg-[#F4F4F7] flex items-center justify-center shrink-0">{providerMark(a.provider)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-semibold text-ink truncate">{a.email}</p>
                    <p className="text-[10px] text-ink-muted">{a.provider === 'gmail' ? 'Gmail' : 'Outlook'} · last synced {a.last_synced_at ? timeAgo(a.last_synced_at) : 'never'} · {a.status}</p>
                  </div>
                  {a.mode === 'real'
                    ? <span className="chip bg-[#ECFDF5] text-[#047857] ring-1 ring-inset ring-[#A7F3D0] shrink-0"><ShieldCheck size={9} strokeWidth={3} /> Real Gmail</span>
                    : <span className="chip bg-[#FFFBEB] text-[#92400E] ring-1 ring-inset ring-[#FDE68A] shrink-0"><Check size={9} strokeWidth={3} /> Simulated</span>}
                  <button className="btn-icon" title="Sync now" aria-label="Sync now" onClick={() => sync(a)} disabled={syncing === a.id}>
                    <RefreshCw size={15} className={syncing === a.id ? 'animate-spin' : ''} />
                  </button>
                  <button className="btn-icon hover:!text-[#B42318]" title="Disconnect" aria-label="Disconnect" onClick={() => setDisconnecting(a)}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Connect modal */}
      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.provider === 'gmail' && gmailStatus[modal?.clientId]?.configured ? 'Connect Gmail — real OAuth' : 'Connect a mailbox — demo mode'}>
        {modal && modal.provider === 'gmail' && gmailStatus[modal.clientId]?.configured && (
          <div className="space-y-4">
            <p className="text-[12.5px] text-ink-secondary leading-relaxed">You’ll be sent to Google to authorise Relay. Requested scopes, exactly:</p>
            <ul className="text-[11.5px] text-ink-secondary space-y-1.5 list-disc pl-5">
              <li><code className="font-mono text-[10px]">gmail.readonly</code> — read inbox threads so they can be triaged</li>
              <li><code className="font-mono text-[10px]">gmail.modify</code> — reflect mark-read/archive back to Gmail</li>
              <li><code className="font-mono text-[10px]">gmail.send</code> — send replies you explicitly approve</li>
            </ul>
            <p className="text-[10.5px] text-ink-muted">Tokens are stored encrypted on the server (AES-256-GCM) and never shown to the browser. You can disconnect — revoking access — at any time.</p>
            {!gmailStatus[modal.clientId]?.keyConfigured && <p className="text-[10.5px] text-[#B42318] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">GMAIL_TOKEN_SECRET is not set on this deployment — the server will refuse to store tokens.</p>}
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button type="button" className="btn-primary" onClick={connectWithGoogle}><ShieldCheck size={14} /> Continue with Google</button></div>
          </div>
        )}
        {modal && !(modal.provider === 'gmail' && gmailStatus[modal.clientId]?.configured) && (
          <form onSubmit={connect} className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {['gmail', 'outlook'].map((p) => (
                <button type="button" key={p} onClick={() => setModal({ ...modal, provider: p })} aria-pressed={modal.provider === p}
                  className={`h-16 rounded-xl border flex items-center justify-center gap-2 transition-all ${modal.provider === p ? 'border-brand-600 ring-2 ring-brand-600/20 bg-brand-50/40' : 'border-hairline bg-white hover:border-[#D5D5DB]'}`}>
                  {providerMark(p)}<span className="text-[13px] font-semibold text-ink">{p === 'gmail' ? 'Gmail' : 'Outlook'}</span>
                </button>
              ))}
            </div>
            <div><label className="label" htmlFor="acct-email">Mailbox address</label><input id="acct-email" autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" className="input" /></div>
            <p className="text-[10px] text-[#B45309] flex items-center gap-1.5"><Info size={11} /> Simulated connection — no real credentials are used or stored.{modal.provider === 'gmail' && ' (Real Google sign-in appears here automatically once GOOGLE_CLIENT_ID/SECRET are set.)'}</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setModal(null)}>Cancel</button><button type="submit" className="btn-primary"><Link2 size={14} /> Connect (simulated)</button></div>
          </form>
        )}
      </Modal>

      <ConfirmModal open={!!disconnecting} onClose={() => setDisconnecting(null)} title="Disconnect mailbox?" danger body={`“${disconnecting?.email}” will stop syncing in Relay. Existing indexed threads are kept as read-only history.`} confirmLabel="Disconnect" onConfirm={disconnect} />
    </div>
  );
}
