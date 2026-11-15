// Assistant onboarding step 3: connect a client mailbox.
// Real OAuth (Gmail/Outlook) requires provider credentials that are not
// configured here, so the flow runs in SIMULATED mode and says so plainly.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, ArrowRight, Info, ShieldCheck, SkipForward } from 'lucide-react';
import api from '../api';
import { useToast } from '../context.jsx';
import { Modal } from '../components/Modal';
import Logo from '../components/Logo';

const PROVIDERS = [
  {
    id: 'gmail', name: 'Gmail', sub: 'Google Workspace & personal accounts',
    mark: (
      <svg viewBox="0 0 24 24" className="w-6 h-6"><path fill="#EA4335" d="M4 6.5l8 6 8-6V6H4z" opacity="0"/><path fill="#4285F4" d="M5.5 5h13a1 1 0 011 1v12a1 1 0 01-1 1h-2V9l-4.5 3.4L7.5 9v10h-2a1 1 0 01-1-1V6a1 1 0 011-1z" opacity="0"/><path fill="#EA4335" d="M4.4 6h15.2c.6 0 1 .5 1 .9v1L12 13.4 3.4 7.9v-1c0-.5.4-.9 1-.9z"/><path fill="#FBBC05" d="M3.4 7.9L12 14l8.6-6.1V18a1.6 1.6 0 01-1.6 1.6H5A1.6 1.6 0 013.4 18z" opacity="0.92"/><path fill="#34A853" d="M12 15.6l2.4-1.7H12z" opacity="0"/></svg>
    ),
  },
  {
    id: 'outlook', name: 'Outlook', sub: 'Microsoft 365 & Outlook.com',
    mark: (
      <svg viewBox="0 0 24 24" className="w-6 h-6"><rect x="2.5" y="5" width="12" height="14" rx="1.8" fill="#0A6ED1"/><path fill="#28A8E8" d="M14.5 9.2l7-2.4v10.4l-7-2.4z"/><ellipse cx="8.5" cy="12" rx="2.9" ry="3.4" fill="#fff"/><ellipse cx="8.5" cy="12" rx="1.8" ry="2.2" fill="#0A6ED1"/></svg>
    ),
  },
];

export default function AssistantConnect() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [modal, setModal] = useState(null); // { provider, clientId }
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState('idle'); // idle | authorizing | done
  const [connected, setConnected] = useState([]);

  useEffect(() => { api.get('/api/clients').then(({ data }) => setClients(data.clients)).catch(() => {}); }, []);

  const startConnect = (provider, clientId) => { setModal({ provider, clientId }); setEmail(''); setStage('idle'); };

  const authorize = async () => {
    if (!email.trim()) return;
    setStage('authorizing');
    // Simulated OAuth consent round-trip (1.4s) — clearly labelled as demo.
    await new Promise((r) => setTimeout(r, 1400));
    try {
      const { data } = await api.post('/api/accounts/connect', { clientId: modal.clientId, provider: modal.provider.id, email: email.trim() });
      setConnected((c) => [...c, { id: data.accountId, provider: modal.provider.id, email: email.trim(), clientName: clients.find((cl) => cl.id === modal.clientId)?.name }]);
      setStage('done');
    } catch (err) {
      toast(err.message, 'error');
      setStage('idle');
    }
  };

  const closeModal = () => { setModal(null); setStage('idle'); };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="h-16 flex items-center px-4 sm:px-8 border-b border-hairline/70">
        <Logo size={26} /><span className="ml-2.5 text-[15px] font-bold tracking-tight">Relay</span>
        <button className="btn-ghost ml-auto" onClick={() => navigate('/app', { replace: true })}><SkipForward size={15} /> Skip for now</button>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Step 3 — Connect inboxes</p>
        <h1 className="mt-2 text-[26px] sm:text-[30px] font-bold tracking-[-0.02em]">Bring your client’s mail into Relay</h1>
        <p className="mt-1.5 text-[13px] text-ink-secondary max-w-xl">Relay only reads and sends with the permissions you grant. In this environment the connection is a realistic <strong>simulated demo</strong> — no real credentials ever touch our servers.</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] font-medium text-[#92400E]">
          <Info size={13} /> Demo mode: connections are simulated end-to-end and labelled “Simulated”. See README to enable real Google/Microsoft OAuth.
        </div>

        {/* Client → provider connectors */}
        {clients.length === 0 && <p className="mt-8 text-[13px] text-ink-muted">No clients yet — you can add them later from “Manage clients”. <button className="text-brand-700 font-semibold" onClick={() => navigate('/app')}>Go to dashboard</button></p>}
        <div className="mt-6 space-y-4">
          {clients.map((client) => (
            <div key={client.id} className="card p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-ink">{client.name}</p>
                  <p className="text-[11px] text-ink-muted">{client.company} · linked login: <span className="font-medium text-ink-secondary">{client.login_email || 'not created'}</span></p>
                </div>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-ink-muted whitespace-nowrap">Choose provider</span>
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                {PROVIDERS.map((p) => {
                  const done = connected.some((c) => c.provider === p.id && c.clientName === client.name);
                  return (
                    <button key={p.id} onClick={() => startConnect(p, client.id)}
                      className="flex items-center gap-3 h-16 px-4 rounded-xl border border-hairline bg-[#FCFCFD] hover:border-brand-500 hover:bg-brand-50/40 transition-all text-left">
                      <span className="w-10 h-10 rounded-lg bg-white border border-hairline flex items-center justify-center">{p.mark}</span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-semibold text-ink">{p.name}</span>
                        <span className="block text-[10px] text-ink-muted leading-tight">{p.sub}</span>
                      </span>
                      {done
                        ? <span className="ml-auto chip bg-[#ECFDF5] text-[#047857] ring-1 ring-inset ring-[#A7F3D0]"><Check size={11} strokeWidth={3} /> Connected</span>
                        : <span className="ml-auto text-[11px] font-semibold text-brand-700">Connect →</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-ink-muted"><ShieldCheck size={13} className="text-emerald-600" /> Scopes requested: read mail, send mail, manage labels — never your password.</div>
          <button className="btn-dark" onClick={() => navigate('/app', { replace: true })}>Open dashboard <ArrowRight size={15} /></button>
        </div>
      </main>

      {/* Simulated consent modal */}
      <Modal open={!!modal} onClose={closeModal} title={`Connect ${modal?.provider.name} — demo consent`}>
        {modal && stage !== 'done' && (
          <>
            <div className="rounded-xl border border-hairline bg-[#FCFCFD] p-4 flex items-center gap-3">
              <span className="w-11 h-11 rounded-lg bg-white border border-hairline flex items-center justify-center">{modal.provider.mark}</span>
              <div className="text-[12px] text-ink-secondary leading-snug"><span className="font-semibold text-ink">Relay would like to access your {modal.provider.name} account</span><br />to read, label and send email on behalf of your client.</div>
            </div>
            <ul className="mt-3 space-y-1.5 text-[11.5px] text-ink-secondary">
              {['Read and search messages', 'Send email as the client (only with your explicit approval)', 'Manage labels and archive state'].map((s) => (
                <li key={s} className="flex items-center gap-2"><Check size={12} className="text-emerald-600 shrink-0" strokeWidth={3} />{s}</li>
              ))}
            </ul>
            <label className="label mt-4" htmlFor="mailbox">Mailbox address</label>
            <input id="mailbox" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@company.com" className="input" onKeyDown={(e) => e.key === 'Enter' && authorize()} />
            <p className="mt-2 text-[10px] text-[#B45309] flex items-center gap-1.5"><Info size={11} /> Simulated consent screen — no real Google/Microsoft servers are contacted.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button className="btn-primary" disabled={!email.trim() || stage === 'authorizing'} onClick={authorize}>
                {stage === 'authorizing' ? <><Loader2 size={14} className="animate-spin" /> Authorizing…</> : 'Allow access (demo)'}
              </button>
            </div>
          </>
        )}
        {modal && stage === 'done' && (
          <div className="py-2 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-full bg-[#ECFDF5] flex items-center justify-center"><Check size={26} className="text-emerald-600" strokeWidth={2.5} /></span>
            <h4 className="mt-3 text-[15px] font-bold text-ink">Mailbox connected</h4>
            <p className="mt-1 text-[12px] text-ink-secondary">{email}</p>
            <span className="mt-2 chip bg-[#FFFBEB] text-[#92400E] ring-1 ring-inset ring-[#FDE68A]">Simulated connection — demo mode</span>
            <p className="mt-3 text-[11px] text-ink-muted">Initial sync completed. 1,284 messages indexed (simulated).</p>
            <button className="btn-primary mt-4" onClick={closeModal}>Done</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
