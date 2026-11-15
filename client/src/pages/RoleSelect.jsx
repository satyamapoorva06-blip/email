// Step 2 of onboarding: choose how you use Relay.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowRight, ArrowLeft, Check, Briefcase, User } from 'lucide-react';
import { useAuth } from '../context.jsx';
import Logo from '../components/Logo';

const ROLES = [
  { id: 'assistant', icon: Briefcase, title: 'Personal Assistant', subtitle: 'I manage inboxes on behalf of clients', points: ['Full triage dashboard & AI classification', 'Switch between multiple client workspaces', 'Draft, review and send replies with approval'] },
  { id: 'client', icon: User, title: 'Client', subtitle: 'My assistant handles email for me', points: ['A calm list of only what needs your decision', 'Approve or reject requests in one tap', 'Hand threads back to your assistant any time'] },
];

export default function RoleSelect() {
  const { setRole, user } = useAuth();
  const navigate = useNavigate();
  const [role, setRoleLocal] = useState('assistant');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await setRole(role);
      navigate(role === 'assistant' ? '/onboarding/connect' : '/client', { replace: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="h-16 flex items-center px-4 sm:px-8">
        <Logo size={26} /><span className="ml-2.5 text-[15px] font-bold tracking-tight">Relay</span>
        <button className="btn-ghost ml-auto" onClick={() => navigate(-1)}><ArrowLeft size={15} /> Back</button>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-16">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Step 2 of 2 — Your role</p>
        <h1 className="mt-3 text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] text-center">How will you use Relay?</h1>
        <p className="mt-2 text-[13px] text-ink-secondary">Signed in as {user?.email}</p>

        <div className="mt-8 grid sm:grid-cols-2 gap-4 w-full max-w-2xl">
          {ROLES.map(({ id, icon: Icon, title, subtitle, points }) => {
            const active = role === id;
            return (
              <button key={id} onClick={() => setRoleLocal(id)} aria-pressed={active}
                className={`relative text-left rounded-2xl border p-5 transition-all duration-150 bg-white ${active ? 'border-brand-600 ring-2 ring-brand-600/20 shadow-lift' : 'border-hairline hover:border-[#D5D5DB]'}`}>
                <span className={`absolute top-4 right-4 w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-[#D4D4D9] text-transparent'}`}><Check size={12} strokeWidth={3} /></span>
                <span className="w-11 h-11 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center"><Icon size={21} strokeWidth={1.8} /></span>
                <span className="mt-4 block text-[16px] font-bold text-ink">{title}</span>
                <span className="mt-0.5 block text-[12px] text-ink-secondary">{subtitle}</span>
                <ul className="mt-4 space-y-2">
                  {points.map((p) => <li key={p} className="flex items-start gap-1.5 text-[11px] text-ink-secondary leading-snug"><Check size={12} className="mt-0.5 shrink-0 text-emerald-600" strokeWidth={3} />{p}</li>)}
                </ul>
              </button>
            );
          })}
        </div>

        <button onClick={submit} disabled={busy} className="btn-primary h-11 px-8 mt-8 text-[14px]">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <>Continue as {ROLES.find((r) => r.id === role).title} <ArrowRight size={15} /></>}
        </button>
        <p className="mt-4 text-[10.5px] text-ink-muted">This cannot be changed later — choose carefully.</p>
      </main>
    </div>
  );
}
