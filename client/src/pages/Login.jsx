import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../context.jsx';
import { useToast } from '../context.jsx';
import AuthShell from '../components/AuthShell';

const DEMO_ACCOUNTS = [
  { label: 'Priya · Assistant', email: 'priya@relay.app', hint: 'Full workspace' },
  { label: 'Rahul · Client', email: 'rahul@meridianventures.com', hint: 'Client decisions only' },
  { label: 'Anita · Client', email: 'anita@loomandco.com', hint: 'Client decisions only' },
];

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('demo1234');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const user = await login(email.trim(), password);
      if (!user.role) return navigate('/onboarding/role', { replace: true });
      navigate(user.role === 'assistant' ? '/app' : '/client', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (acct) => {
    setEmail(acct.email);
    setPassword('demo1234');
    setError('');
    if (location.state?.demo) toast('Demo credentials filled — press Sign in.', 'info');
  };

  return (
    <AuthShell>
      <Link to="/" className="lg:hidden flex items-center gap-2 mb-8"><MailCheck size={18} className="text-brand-600" /><span className="font-bold">Relay</span></Link>
      <h2 className="text-[24px] font-bold tracking-tight text-ink">Welcome back</h2>
      <p className="mt-1.5 text-[13px] text-ink-secondary">Sign in to your workspace. New here? <Link to="/register" className="text-brand-700 font-semibold hover:underline">Create an account</Link></p>

      {/* Demo quick-fill */}
      <div className="mt-5 rounded-xl border border-hairline bg-[#FCFCFD] p-2.5">
        <p className="px-1 pb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Demo accounts — password demo1234</p>
        <div className="flex flex-wrap gap-1.5">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} onClick={() => fillDemo(a)} title={a.hint}
              className={`h-7 px-2.5 rounded-md text-[11px] font-medium border transition-colors ${email === a.email ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-hairline bg-white text-ink-secondary hover:border-brand-300 hover:text-brand-800'}`}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" className="input pr-10" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-1.5" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {error && <p role="alert" className="text-[12px] font-medium text-[#B42318] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full h-10 text-[13px]">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <>Sign in <ArrowRight size={15} /></>}
        </button>
      </form>
    </AuthShell>
  );
}
