// Client roster: see both clients at a glance, add new ones, copy demo logins.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Copy, Check, Building2, MailOpen, Zap, Inbox, ArrowRight } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import { useWorkspace } from '../../workspace.jsx';
import { Modal } from '../../components/Modal';
import Avatar from '../../components/Avatar';

export default function ClientsRoster() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setClientId, refreshClients } = useWorkspace();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', company: '', email: '', createLogin: true });
  const [created, setCreated] = useState(null); // { clientId, tempPassword, email }
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/clients'); setClients(data.clients); } catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/api/clients', form);
      setCreated({ ...data, email: form.email.trim().toLowerCase() });
      setAddOpen(false);
      setForm({ name: '', company: '', email: '', createLogin: true });
      refreshClients();
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const copy = async () => {
    const text = `Relay client workspace\nLogin: ${created.email}\nTemporary password: ${created.tempPassword ?? '(existing account)'}\nSign in at: /login`;
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { toast('Select and copy the text manually.', 'info'); }
  };

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><Users size={19} className="text-brand-600" /> Clients</h1>
          <p className="mt-1 text-[12px] text-ink-secondary">Each client gets a linked login and a scoped inbox feed. Switch workspaces from the sidebar at any time.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add client</button>
      </div>

      <div className="mt-5 grid md:grid-cols-2 gap-4">
        {loading && [0, 1].map((i) => <div key={i} className="h-56 rounded-xl bg-[#F0F0F3] animate-pulse" />)}
        {clients.map((c) => (
          <div key={c.id} className="card p-5 flex flex-col">
            <div className="flex items-center gap-3">
              <Avatar name={c.name} color={c.avatar_color} size={44} />
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-ink leading-tight">{c.name}</p>
                <p className="text-[11px] text-ink-muted flex items-center gap-1"><Building2 size={11} />{c.company}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[
                { icon: Inbox, n: c.counts?.open ?? 0, l: 'Open' },
                { icon: MailOpen, n: c.counts?.unread ?? 0, l: 'Unread' },
                { icon: Zap, n: c.counts?.attention ?? 0, l: 'Needs decision' },
              ].map(({ icon: Icon, n, l }) => (
                <div key={l} className="rounded-lg border border-hairline bg-[#FCFCFD] py-2">
                  <Icon size={13} className="mx-auto text-ink-muted" />
                  <p className="mt-1 text-[17px] font-bold tabular-nums text-ink leading-none">{n}</p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wide text-ink-muted">{l}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] text-ink-secondary">
              <p className="flex items-center justify-between gap-2"><span className="text-ink-muted">Mailbox</span><span className="font-medium truncate">{c.email}</span></p>
              <p className="mt-1 flex items-center justify-between gap-2"><span className="text-ink-muted">Client login</span><span className="font-medium truncate">{c.login_email || 'not created'}</span></p>
            </div>
            <button className="btn-secondary mt-4 w-full" onClick={() => { setClientId(c.id); navigate('/app/emails'); }}>Open {c.name.split(' ')[0]}’s inbox <ArrowRight size={13} /></button>
          </div>
        ))}
      </div>

      {/* One-time credential hand-off */}
      {created && (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <p className="text-[12px] font-bold text-emerald-900">Client login created — share these credentials once</p>
          <pre className="mt-2 text-[11px] leading-relaxed text-emerald-900 font-mono bg-white/70 border border-emerald-200 rounded-lg px-3 py-2 whitespace-pre-wrap">{`Login: ${created.email}\nTemporary password: ${created.tempPassword ?? '(their existing Relay password)'}`}</pre>
          <div className="mt-2 flex items-center gap-2">
            <button className="btn-secondary !h-8 !text-[11.5px]" onClick={copy}>{copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />} Copy credentials</button>
            <button className="btn-ghost !h-8 !text-[11.5px]" onClick={() => setCreated(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Add client modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a client">
        <form onSubmit={submit} className="space-y-3.5">
          <div><label className="label" htmlFor="cname">Full name</label><input id="cname" autoFocus required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Anita Desai" className="input" /></div>
          <div><label className="label" htmlFor="ccompany">Company</label><input id="ccompany" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Loom & Co." className="input" /></div>
          <div><label className="label" htmlFor="cemail">Primary mailbox</label><input id="cemail" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="anita@loomandco.com" className="input" /></div>
          <label className="flex items-center gap-2.5 text-[12px] text-ink-secondary cursor-pointer select-none">
            <input type="checkbox" className="w-4 h-4 rounded border-hairline accent-[#4F46E5]" checked={form.createLogin} onChange={(e) => setForm({ ...form, createLogin: e.target.checked })} />
            Also create a linked client login (shown once after creation)
          </label>
          <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Add client</button></div>
        </form>
      </Modal>
    </div>
  );
}
