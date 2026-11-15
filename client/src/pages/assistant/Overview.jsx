// Assistant home: greeting, four headline numbers, and a calm working queue.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Inbox, MailOpen, Zap, UserCheck, Star, ArrowRight, Clock, Hourglass, CalendarDays, ArrowUpRight, Flag, Sparkles } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context.jsx';
import { useWorkspace } from '../../workspace.jsx';
import { greeting, todayLong, timeAgo, meetingDay } from '../../utils';
import { ClassificationBadge, ApprovalBadge } from '../../components/badges';
import ActivityTimeline from '../../components/ActivityTimeline';
import EmptyState from '../../components/EmptyState';

function StatCard({ icon: Icon, label, value, sub, to, tint }) {
  const navigate = useNavigate();
  return (
    <button onClick={() => navigate(to)} className="card p-4 text-left hover:shadow-lift hover:-translate-y-px transition-all duration-150 group">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: tint.bg, color: tint.fg }}><Icon size={15} /></span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-bold tracking-tight text-ink tabular-nums">{value}</span>
        <ArrowUpRight size={14} className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-1 text-[10px] text-ink-muted">{sub}</p>
    </button>
  );
}

function ThreadRow({ email }) {
  return (
    <Link to={`/app/email/${email.id}`} className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[#FCFCFE] border-b border-hairline last:border-0 transition-colors">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${email.is_read ? 'bg-transparent' : 'bg-brand-600'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={`text-[11.5px] truncate ${email.is_read ? 'text-ink-secondary font-medium' : 'text-ink font-semibold'}`}>{email.sender_name}</span>
          {email.importance === 'high' && <Flag size={10} className="text-[#DC2626] fill-[#DC2626] shrink-0" />}
          {email.approval_status !== 'none' && <ApprovalBadge approval={email.approval_status} />}
        </span>
        <span className="block text-[10.5px] text-ink-secondary truncate">{email.subject}</span>
        <span className="mt-0.5 hidden sm:block"><ClassificationBadge classification={email.classification} /></span>
      </span>
      <time className="text-[9.5px] text-ink-muted tabular-nums whitespace-nowrap">{timeAgo(email.last_activity_at)}</time>
    </Link>
  );
}

function SectionCard({ icon: Icon, title, linkTo, linkLabel = 'View all', children }) {
  return (
    <section className="card overflow-hidden">
      <header className="flex items-center gap-2 px-4 h-11 border-b border-hairline bg-[#FCFCFD]">
        <Icon size={15} className="text-ink-secondary" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">{title}</h2>
        {linkTo && <Link to={linkTo} className="ml-auto flex items-center gap-0.5 text-[11px] font-semibold text-brand-700 hover:text-brand-800">{linkLabel}<ArrowRight size={12} /></Link>}
      </header>
      {children}
    </section>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const { clientId, counts, refreshCounts } = useWorkspace();
  const [data, setData] = useState({ priority: [], recent: [], waiting: [], meetings: [], activity: [] });
  const params = { clientId: clientId === 'all' ? undefined : clientId };

  useEffect(() => {
    refreshCounts();
    const load = async () => {
      const [priority, recent, waiting, meetings, activity] = await Promise.allSettled([
        api.get('/api/emails', { params: { ...params, filter: 'important', sort: 'important' } }),
        api.get('/api/emails', { params: { ...params, filter: 'all', sort: 'newest' } }),
        api.get('/api/emails', { params: { ...params, filter: 'waiting', sort: 'oldest' } }),
        api.get('/api/meetings', { params: { ...params, range: 'upcoming' } }),
        api.get('/api/activity', { params: { ...params, limit: 5 } }),
      ]);
      setData({
        priority: priority.value?.data.emails?.slice(0, 5) || [],
        recent: recent.value?.data.emails?.slice(0, 6) || [],
        waiting: waiting.value?.data.emails?.slice(0, 3) || [],
        meetings: meetings.value?.data.meetings?.slice(0, 3) || [],
        activity: activity.value?.data.activity || [],
      });
    };
    load();
  }, [clientId]); // eslint-disable-line

  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{todayLong()}</p>
          <h1 className="mt-1 text-[23px] sm:text-[26px] font-bold tracking-[-0.02em] text-ink">{greeting()}, {firstName}</h1>
          <p className="mt-0.5 text-[12px] text-ink-secondary">Here’s the shape of the inbox{clientId === 'all' ? ' across your clients' : ''} — what needs you first.</p>
        </div>
        <Link to="/app/emails?filter=action" className="btn-secondary"><Zap size={14} className="text-amber-600" /> Review action queue</Link>
      </div>

      {/* Headline numbers */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={Inbox} label="Total emails" value={counts.total ?? '—'} sub="Open conversations" to="/app/emails" tint={{ bg: '#F1F1F4', fg: '#3F3F46' }} />
        <StatCard icon={MailOpen} label="Unread" value={counts.unread ?? '—'} sub="Across all open threads" to="/app/emails?sort=unread" tint={{ bg: '#EFF6FF', fg: '#1D4ED8' }} />
        <StatCard icon={Zap} label="Needs action" value={counts.needsAction ?? '—'} sub="Decisions, approvals & reviews" to="/app/emails?filter=action" tint={{ bg: '#FFFBEB', fg: '#B45309' }} />
        <StatCard icon={UserCheck} label="Client attention" value={counts.clientAttention ?? '—'} sub="Waiting on the client" to="/app/emails?filter=client" tint={{ bg: '#FFF7ED', fg: '#C2410C' }} />
      </div>

      {/* Working queue */}
      <div className="mt-5 grid xl:grid-cols-12 gap-4 items-start">
        <div className="lg:col-span-7 space-y-4">
          <SectionCard icon={Star} title="Priority inbox" linkTo="/app/emails?filter=important">
            {data.priority.length === 0
              ? <EmptyState icon={Sparkles} title="No priorities flagged" body="High-importance and starred threads will surface here." />
              : data.priority.map((e) => <ThreadRow key={e.id} email={e} />)}
          </SectionCard>

          <SectionCard icon={Clock} title="Recent conversations" linkTo="/app/emails">
            {data.recent.map((e) => <ThreadRow key={e.id} email={e} />)}
          </SectionCard>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <SectionCard icon={Hourglass} title="Pending responses" linkTo="/app/emails?filter=waiting" linkLabel="Follow-ups">
            {data.waiting.length === 0
              ? <p className="px-4 py-5 text-[12px] text-ink-muted">Nothing is waiting on the other side right now.</p>
              : data.waiting.map((e) => (
                <Link key={e.id} to={`/app/email/${e.id}`} className="flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-0 hover:bg-[#FCFCFE]">
                  <div className="w-8 h-8 rounded-lg bg-[#F4F4F7] flex items-center justify-center shrink-0"><Hourglass size={14} className="text-ink-secondary" /></div>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-semibold text-ink truncate">{e.subject}</span>
                    <span className="block text-[10px] text-ink-muted">awaiting reply · since {timeAgo(e.waiting_since)}</span>
                  </span>
                  <ArrowRight size={13} className="text-ink-muted shrink-0" />
                </Link>
              ))}
          </SectionCard>

          <SectionCard icon={CalendarDays} title="Upcoming meetings" linkTo="/app/meetings">
            {data.meetings.length === 0
              ? <p className="px-4 py-5 text-[12px] text-ink-muted">No upcoming meetings. Threads with dates are extracted automatically.</p>
              : data.meetings.map((m) => {
                const d = meetingDay(m.start_at);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-3 border-b border-hairline last:border-0">
                    <div className="w-10 h-10 rounded-lg border border-hairline bg-white flex flex-col items-center justify-center shrink-0">
                      <span className="text-[12px] font-bold leading-none text-ink">{d.day}</span>
                      <span className="text-[8px] uppercase tracking-wide text-ink-muted">{d.month}</span>
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-semibold text-ink leading-snug truncate">{m.title}</span>
                      <span className="block text-[10px] text-ink-muted truncate">{d.label} · {d.time}{m.location ? ` · ${m.location}` : ''}</span>
                    </span>
                  </div>
                );
              })}
          </SectionCard>

          <SectionCard icon={Sparkles} title="Recent activity" linkTo="/app/activity">
            <div className="px-4 py-4"><ActivityTimeline items={data.activity} compact /></div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
