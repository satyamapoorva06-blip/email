// Client home — deliberately sparse. Only what needs THE client.
import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, ShieldQuestion, Flag, CircleCheck, CornerUpLeft, Check, X, ArrowRight, Inbox } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import ClientShell from '../../components/ClientShell';
import Avatar from '../../components/Avatar';
import EmptyState from '../../components/EmptyState';
import { greeting, timeAgo } from '../../utils';

function DecisionCard({ item, assistantFirst, onUpdate }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'approved' || kind === 'rejected') {
        await api.post(`/api/client/conversations/${item.id}/approval`, { decision: kind });
        toast(kind === 'approved' ? 'Approved — your assistant has been notified.' : 'Rejected — your assistant will not proceed.');
        onUpdate(item.id, { approval_status: kind });
      } else if (kind === 'handled') {
        await api.post(`/api/client/conversations/${item.id}/action`, { action: 'handled' });
        toast('Marked as handled.');
        onUpdate(item.id, { __remove: true });
      } else if (kind === 'ask') {
        await api.post(`/api/client/conversations/${item.id}/action`, { action: 'ask_assistant' });
        toast(`${assistantFirst} will take it from here.`);
        onUpdate(item.id, { __remove: true });
      }
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };

  const first = (item.sender_name || '').split(' ')[0];

  return (
    <article className="card overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-3">
          <Avatar name={item.sender_name} color="#3F3F46" size={36} />
          <div className="min-w-0">
            <p className="text-[13px] font-bold text-ink leading-tight truncate">{item.sender_name}</p>
            <p className="text-[10.5px] text-ink-muted truncate">{item.sender_email}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {item.importance === 'high' && <span className="chip bg-[#FEF2F2] text-[#B42318] ring-1 ring-inset ring-[#FECACA]"><Flag size={10} className="fill-[#B42318]" /> Time-sensitive</span>}
            <time className="text-[10.5px] text-ink-muted tabular-nums">{timeAgo(item.last_activity_at)}</time>
          </div>
        </div>

        <h2 className="mt-3 text-[16px] font-bold tracking-tight text-ink leading-snug">{item.subject}</h2>

        <div className="mt-3 rounded-lg bg-[#F6F6F9] px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-muted"><Sparkles size={11} className="text-brand-600" /> AI summary</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#2B2B31]">{item.summary}</p>
        </div>
        <div className="mt-2.5 flex items-start gap-2 px-1">
          <ShieldQuestion size={14} className="text-[#B45309] shrink-0 mt-0.5" />
          <p className="text-[12px] leading-snug text-[#6b4a12]"><span className="font-semibold">Why you:</span> {item.reason}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-t border-hairline bg-[#FCFCFD]">
        <button className="btn-secondary" onClick={() => navigate(`/client/email/${item.id}`)}>Review email <ArrowRight size={13} /></button>
        {item.approval_status === 'pending' ? (
          <>
            <button className="h-9 px-3.5 rounded-lg text-[13px] font-semibold bg-emerald-700 text-white hover:bg-emerald-800 flex items-center gap-1.5 disabled:opacity-60" disabled={busy} onClick={() => act('approved')}><Check size={14} /> Approve</button>
            <button className="h-9 px-3.5 rounded-lg text-[13px] font-semibold bg-white border border-hairline text-[#B42318] hover:bg-[#FEF2F2] flex items-center gap-1.5 disabled:opacity-60" disabled={busy} onClick={() => act('rejected')}><X size={14} /> Reject</button>
          </>
        ) : item.approval_status === 'approved' ? (
          <span className="chip bg-[#ECFDF5] text-[#047857] ring-1 ring-inset ring-[#A7F3D0] !h-7 !px-2.5 text-[11px]"><Check size={11} strokeWidth={3} /> You approved</span>
        ) : item.approval_status === 'rejected' ? (
          <span className="chip bg-[#FEF2F2] text-[#B42318] ring-1 ring-inset ring-[#FECACA] !h-7 !px-2.5 text-[11px]"><X size={11} strokeWidth={3} /> You rejected</span>
        ) : null}
        <button className="btn-ghost ml-auto" onClick={() => act('handled')} disabled={busy} title="Close it out"><CircleCheck size={14} /> Handled</button>
        <button className="btn-ghost" onClick={() => act('ask')} disabled={busy} title={`Reassign to ${assistantFirst}`}><CornerUpLeft size={14} /> Ask {assistantFirst}</button>
      </div>
    </article>
  );
}

export default function ClientHome() {
  const { toast } = useToast();
  const [overview, setOverview] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/client/overview');
      setOverview(data);
      setItems(data.attention);
    } catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const updateItem = (id, patch) => {
    setItems((list) => patch.__remove ? list.filter((i) => i.id !== id) : list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  if (loading) {
    return <ClientShell><div className="space-y-4">{[0, 1].map((i) => <div key={i} className="h-56 rounded-xl bg-[#F0F0F3] animate-pulse" />)}</div></ClientShell>;
  }

  if (!overview?.client) {
    return (
      <ClientShell>
        <EmptyState icon={Inbox} title="No inbox linked yet" body="Ask your assistant to create your client login — once they do, the emails that need you will appear right here." />
      </ClientShell>
    );
  }

  const firstName = overview.client.name.split(' ')[0];
  const assistantFirst = (overview.assistant || 'your assistant').split(' ')[0];

  return (
    <ClientShell>
      <div>
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-muted">{overview.client.company}</p>
        <h1 className="mt-1 text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] text-ink">{greeting()}, {firstName}</h1>
        <p className="mt-1 text-[13px] text-ink-secondary">{items.length === 0 ? 'Nothing needs your decision right now.' : <>There {items.length === 1 ? 'is' : 'are'} <strong className="text-ink">{items.length}</strong> thing{items.length === 1 ? '' : 's'} waiting for your decision. Nothing else reaches you.</>}</p>
      </div>

      <div className="mt-6 space-y-4">
        {items.map((item) => <DecisionCard key={item.id} item={item} assistantFirst={assistantFirst} onUpdate={updateItem} />)}
        {items.length === 0 && (
          <div className="card p-10 text-center">
            <CircleCheck size={40} className="mx-auto text-emerald-600" strokeWidth={1.5} />
            <h2 className="mt-3 text-[17px] font-bold text-ink">You’re all caught up</h2>
            <p className="mt-1 text-[12.5px] text-ink-secondary max-w-sm mx-auto">No approvals, decisions or signatures pending. {assistantFirst} keeps the rest of the inbox moving and will surface the next thing that truly needs you.</p>
            <Link to="/client/all" className="btn-secondary mt-5">Browse everything in my inbox</Link>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <p className="mt-6 text-center text-[11px] text-ink-muted">Only your decisions appear here — newsletters, logistics and automated mail never reach you. <Link className="font-semibold text-brand-700 hover:underline" to="/client/all">Show everything</Link></p>
      )}
    </ClientShell>
  );
}
