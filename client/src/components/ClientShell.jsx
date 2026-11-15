// Client surface chrome: ultra-minimal header, lots of air, no inbox clutter.
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../context.jsx';
import Logo from './Logo';

export default function ClientShell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-app">
      <header className="h-14 border-b border-hairline/80 bg-white/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto h-full px-4 sm:px-6 flex items-center gap-2">
          <Logo size={22} />
          <span className="text-[13px] font-bold tracking-tight text-ink">Relay</span>
          <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-muted border border-hairline rounded px-1.5 py-0.5 ml-1">Client</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden sm:block text-[11px] text-ink-muted">{user?.name}</span>
            <button className="btn-ghost" onClick={async () => { await logout(); navigate('/login', { replace: true }); }} aria-label="Sign out"><LogOut size={15} /><span className="hidden sm:inline">Sign out</span></button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
    </div>
  );
}
