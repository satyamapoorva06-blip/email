import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../context.jsx';
import AuthShell from '../components/AuthShell';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const passwordOk = password.length >= 8;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await register(name, email, password);
      navigate('/onboarding/role', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Link to="/" className="lg:hidden flex items-center gap-2 mb-8"><MailCheck size={18} className="text-brand-600" /><span className="font-bold">Relay</span></Link>
      <h2 className="text-[24px] font-bold tracking-tight text-ink">Create your workspace</h2>
      <p className="mt-1.5 text-[13px] text-ink-secondary">Already have an account? <Link to="/login" className="text-brand-700 font-semibold hover:underline">Sign in</Link></p>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Sharma" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <div className="relative">
            <input id="password" type={show ? 'text' : 'password'} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="input pr-10" aria-describedby="pw-hint" />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink p-1.5" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p id="pw-hint" className={`mt-1.5 text-[10.5px] ${password ? (passwordOk ? 'text-emerald-700' : 'text-[#B45309]') : 'text-ink-muted'}`}>
            {password ? (passwordOk ? '✓ Looks good' : `${8 - password.length} more character${8 - password.length === 1 ? '' : 's'} needed`) : 'Use 8+ characters — a passphrase works well.'}
          </p>
        </div>
        {error && <p role="alert" className="text-[12px] font-medium text-[#B42318] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy || !passwordOk} className="btn-primary w-full h-10 text-[13px]">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={15} /></>}
        </button>
      </form>
    </AuthShell>
  );
}
