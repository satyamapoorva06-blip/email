// Assistant sidebar: brand, workspace switcher, navigation, account footer.
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Inbox, Reply, UserCheck, MailCheck, Zap, Hourglass,
  CalendarDays, Star, Archive, Plug2, Settings, LifeBuoy, ChevronsUpDown,
  Check, Plus, LogOut,
} from 'lucide-react';
import { useAuth } from '../context.jsx';
import { useWorkspace } from '../workspace.jsx';
import Avatar from './Avatar';
import Logo from './Logo';

const NAV = [
  { to: '/app', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/app/emails', label: 'All Emails', icon: Inbox, countKey: 'unread' },
  { to: '/app/emails?filter=assistant', label: 'Assistant to Reply', icon: Reply, dot: '#2563EB', countKey: 'assistantToReply' },
  { to: '/app/emails?filter=client', label: 'Client to Reply', icon: UserCheck, dot: '#D97706', countKey: 'clientAttention' },
  { to: '/app/emails?filter=none', label: 'No Reply Needed', icon: MailCheck, dot: '#71717A' },
  { to: '/app/emails?filter=action', label: 'Action Required', icon: Zap, dot: '#D97706', countKey: 'needsAction', accent: true },
  { to: '/app/emails?filter=waiting', label: 'Waiting for Response', icon: Hourglass, countKey: 'waiting' },
  { to: '/app/meetings', label: 'Meetings & Appointments', icon: CalendarDays },
  { to: '/app/emails?filter=important', label: 'Important', icon: Star, countKey: 'important' },
  { to: '/app/emails?filter=archived', label: 'Archived', icon: Archive },
];

const BOTTOM = [
  { to: '/app/accounts', label: 'Connected Accounts', icon: Plug2 },
  { to: '/app/settings', label: 'Settings', icon: Settings },
  { to: '/app/help', label: 'Help & Support', icon: LifeBuoy },
];

export default function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const { clientId, setClientId, clients, counts } = useWorkspace();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const switcherRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (!switcherRef.current?.contains(e.target)) setSwitcherOpen(false);
      if (!profileRef.current?.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const activeClient = clients.find((c) => String(c.id) === String(clientId));
  const workspaceLabel = activeClient ? activeClient.name.split(' ')[0] + '’s inbox' : 'All clients';
  const workspaceSub = activeClient ? activeClient.company : `${clients.length} client workspaces`;

  const sidebarBody = (
    <div className="flex flex-col h-full bg-white">
      {/* Brand */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-hairline">
        <Logo size={28} />
        <div className="leading-tight">
          <div className="text-[14px] font-bold tracking-tight text-ink">Relay</div>
          <div className="text-[9.5px] font-medium uppercase tracking-[0.14em] text-ink-muted">Email Operations</div>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 pt-3 relative" ref={switcherRef}>
        <button onClick={() => setSwitcherOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 h-11 px-2 rounded-lg border border-hairline bg-[#FCFCFD] hover:border-[#D8D8DE] transition-colors text-left">
          {activeClient
            ? <Avatar name={activeClient.name} color={activeClient.avatar_color} size={26} />
            : <div className="w-[26px] h-[26px] rounded-md bg-ink text-white flex items-center justify-center text-[11px] font-bold">All</div>}
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold text-ink leading-tight truncate">{workspaceLabel}</span>
            <span className="block text-[10px] text-ink-muted leading-tight truncate">{workspaceSub}</span>
          </span>
          <ChevronsUpDown size={14} className="text-ink-muted shrink-0" />
        </button>
        {switcherOpen && (
          <div className="absolute left-3 right-3 top-full mt-1.5 z-30 card p-1.5 shadow-lift animate-fade-up">
            <button onClick={() => { setClientId('all'); setSwitcherOpen(false); }}
              className="w-full flex items-center gap-2.5 px-2 h-9 rounded-md hover:bg-[#F5F5F7] text-left">
              <div className="w-6 h-6 rounded-md bg-ink text-white flex items-center justify-center text-[10px] font-bold">All</div>
              <span className="text-[12px] font-medium text-ink flex-1">All clients</span>
              {clientId === 'all' && <Check size={14} className="text-brand-600" />}
            </button>
            {clients.map((c) => (
              <button key={c.id} onClick={() => { setClientId(c.id); setSwitcherOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2 h-10 rounded-md hover:bg-[#F5F5F7] text-left">
                <Avatar name={c.name} color={c.avatar_color} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-medium text-ink leading-tight truncate">{c.name}</span>
                  <span className="block text-[10px] text-ink-muted leading-tight truncate">{c.company}{c.counts?.unread ? ` · ${c.counts.unread} unread` : ''}</span>
                </span>
                {String(clientId) === String(c.id) && <Check size={14} className="text-brand-600 shrink-0" />}
              </button>
            ))}
            <div className="border-t border-hairline mt-1.5 pt-1.5">
              <button onClick={() => { setSwitcherOpen(false); navigate('/app/clients'); }}
                className="w-full flex items-center gap-2.5 px-2 h-8 rounded-md hover:bg-[#F5F5F7] text-[12px] font-medium text-brand-700">
                <Plus size={14} /> Manage clients
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Primary nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {NAV.map((item) => {
          const count = item.countKey ? counts?.[item.countKey] : 0;
          const Icon = item.icon;
          const [base, query] = item.to.split('?');
          const active = location.pathname === base && (base !== '/app/emails' || (location.search.replace('?', '') || '') === (query || ''));
          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              className={`group flex items-center gap-2.5 h-9 px-2 rounded-lg text-[12.5px] font-medium transition-colors ${active ? 'bg-[#EFEFF2] text-ink' : 'text-ink-secondary hover:text-ink hover:bg-[#F5F5F7]'}`}>
              <span className="relative flex items-center justify-center w-[18px]">
                <Icon size={16} strokeWidth={1.9} className="text-ink-secondary group-hover:text-ink" />
                {item.dot && <span className="absolute -right-0.5 -bottom-0.5 w-[7px] h-[7px] rounded-full ring-2 ring-white" style={{ background: item.dot }} />}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span className={`text-[10px] font-semibold tabular-nums rounded-md px-1.5 h-[18px] flex items-center ${item.accent ? 'bg-[#FEF3C7] text-[#92400E]' : 'bg-[#ECECF0] text-ink-secondary'}`}>{count}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Secondary nav + profile */}
      <div className="border-t border-hairline px-3 py-3 space-y-0.5">
        {BOTTOM.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to} onClick={onClose} aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2.5 h-9 px-2 rounded-lg text-[12.5px] font-medium transition-colors ${active ? 'bg-[#EFEFF2] text-ink' : 'text-ink-secondary hover:text-ink hover:bg-[#F5F5F7]'}`}>
              <Icon size={16} strokeWidth={1.9} />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}

        <div className="relative pt-1.5" ref={profileRef}>
          <button onClick={() => setProfileOpen((v) => !v)}
            className="w-full flex items-center gap-2.5 h-11 px-2 rounded-lg hover:bg-[#F5F5F7] transition-colors text-left">
            <Avatar name={user?.name} color={user?.avatar_color || '#4F46E5'} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-ink leading-tight truncate">{user?.name}</span>
              <span className="block text-[10px] text-ink-muted leading-tight">Personal Assistant</span>
            </span>
            <ChevronsUpDown size={14} className="text-ink-muted" />
          </button>
          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1.5 z-30 card p-1.5 shadow-lift animate-fade-up">
              <div className="px-2 py-1.5 border-b border-hairline mb-1">
                <div className="text-[11px] font-semibold text-ink truncate">{user?.email}</div>
                <div className="text-[9.5px] uppercase tracking-wider text-ink-muted">Assistant workspace</div>
              </div>
              <button onClick={() => { setProfileOpen(false); navigate('/app/settings'); }} className="w-full flex items-center gap-2 px-2 h-8 rounded-md text-[12px] font-medium text-ink-secondary hover:bg-[#F5F5F7] hover:text-ink"><Settings size={14} /> Settings</button>
              <button onClick={logout} className="w-full flex items-center gap-2 px-2 h-8 rounded-md text-[12px] font-medium text-[#B42318] hover:bg-[#FEF2F2]"><LogOut size={14} /> Sign out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: static column */}
      <aside className="hidden lg:block w-[248px] shrink-0 border-r border-hairline h-screen sticky top-0">{sidebarBody}</aside>
      {/* Mobile/tablet: slide-over drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-[272px] shadow-pop animate-slide-in-left">{sidebarBody}</aside>
        </div>
      )}
    </>
  );
}
