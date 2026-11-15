// Top bar: hamburger (mobile), global search (⌘K or /), notifications, AI toggle.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Search, Bell, Sparkles, Check, ChevronDown } from 'lucide-react';
import api from '../api';
import { useAuth } from '../context.jsx';
import { timeAgo } from '../utils';

export default function TopBar({ onMenu, onToggleAI, aiOpen }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const notifRef = useRef(null);
  const unread = notifs.filter((n) => !n.read).length;

  const loadNotifications = () => api.get('/api/notifications').then(({ data }) => setNotifs(data.notifications)).catch(() => {});
  useEffect(() => { loadNotifications(); const t = setInterval(loadNotifications, 45_000); return () => clearInterval(t); }, []);

  useEffect(() => {
    const onDown = (e) => !notifRef.current?.contains(e.target) && setNotifOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Keep the box in sync when navigating with ?q=
  useEffect(() => { setQuery(searchParams.get('q') || ''); }, [searchParams]);

  const submitSearch = (e) => {
    e?.preventDefault();
    const q = query.trim();
    navigate(q ? `/app/emails?q=${encodeURIComponent(q)}` : '/app/emails');
  };

  // Global keyboard shortcuts: "/" or Cmd/Ctrl+K focuses search, Esc blurs.
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('topbar-search')?.focus(); }
      else if (e.key === '/' && !typing) { e.preventDefault(); document.getElementById('topbar-search')?.focus(); }
      else if (e.key === 'Escape' && typing) e.target.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const markAllRead = async () => {
    await api.post('/api/notifications/read', { all: true }).catch(() => {});
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <header className="h-14 shrink-0 bg-white/85 backdrop-blur border-b border-hairline flex items-center gap-2 px-3 sm:px-4 sticky top-0 z-20">
      <button className="btn-icon lg:hidden" onClick={onMenu} aria-label="Open menu"><Menu size={18} /></button>

      <form onSubmit={submitSearch} className="relative flex-1 max-w-xl">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
        <input
          id="topbar-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search senders, subjects, content…"
          className="w-full h-9 pl-9 pr-14 text-[13px] rounded-lg border border-transparent bg-[#F1F1F4] focus:bg-white focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 outline-none transition placeholder:text-ink-muted"
          aria-label="Search emails"
        />
        <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-6 pr-1 pl-2 flex items-center gap-1 rounded text-ink-muted hover:text-ink" aria-label="Search">
          <kbd className="kbd">⌘K</kbd>
        </button>
      </form>

      <div className="flex items-center gap-1 ml-auto">
        <button onClick={onToggleAI}
          className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[12px] font-semibold transition-colors ${aiOpen ? 'bg-brand-600 text-white' : 'text-brand-700 bg-brand-50 hover:bg-brand-100'}`}
          aria-pressed={aiOpen} title="Ask Relay AI">
          <Sparkles size={14} />
          <span className="hidden sm:inline">Ask AI</span>
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button className="btn-icon relative" onClick={() => setNotifOpen((v) => !v)} aria-label="Notifications">
            <Bell size={17} strokeWidth={1.9} />
            {unread > 0 && <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-[#E11D48] text-white text-[8.5px] font-bold flex items-center justify-center">{unread}</span>}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-[min(92vw,360px)] card shadow-pop overflow-hidden z-30 animate-fade-up">
              <div className="flex items-center justify-between px-4 h-10 border-b border-hairline">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Notifications</span>
                {unread > 0 && <button onClick={markAllRead} className="flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:text-brand-800"><Check size={12} /> Mark all read</button>}
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {notifs.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-ink-muted">You’re all caught up.</p>}
                {notifs.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-hairline last:border-0 flex gap-2.5 ${n.read ? '' : 'bg-brand-50/40'}`}>
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read ? 'bg-transparent' : 'bg-brand-600'}`} />
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold text-ink leading-snug">{n.title}</p>
                      <p className="text-[11px] text-ink-secondary leading-snug mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-ink-muted mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Identity chip */}
        <button className="hidden md:flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-[#F5F5F7] transition-colors" onClick={() => navigate('/app/settings')} title="Account settings">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold" style={{ background: user?.avatar_color || '#4F46E5' }}>
            {(user?.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
          </div>
          <span className="text-[12px] font-medium text-ink max-w-[110px] truncate">{user?.name}</span>
          <ChevronDown size={13} className="text-ink-muted" />
        </button>
      </div>
    </header>
  );
}
