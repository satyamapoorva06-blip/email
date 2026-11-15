// Client review: read the full thread, then decide — approve, reject, handle, or hand back.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, CircleCheck, CornerUpLeft, Sparkles, ShieldQuestion, Send, Loader2 } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import ClientShell from '../../components/ClientShell';
import MessageThread from '../../components/MessageThread';
import { ApprovalBadge } from '../../components/badges';
import { fullDateTime } from '../../utils';

export default function ClientReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [note, setNote] = useState('');
  const [askMode, setAskMode] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    try {
      const [detail, ov] = await Promise.all([
        api.get(`/api/client/conversations/${id}`),
        api.get('/api/client/overview').catch(() => null),
      ]);
      setData(detail.data);
      setOverview(ov?.data ?? null);
    } catch (err) { toast(err.message, 'error'); navigate('/client'); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line

  if (!data) return <ClientShell><div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-40 rounded-xl bg-[#F0F0F3] animate-pulse" />)}</div></ClientShell>;

  const { conversation: c, messages } = data;
  const assistantFirst = (overview?.assistant || 'your assistant').split(' ')[0];

  const act = async (kind) => {
    setBusy(kind);
    try {
      if (kind === 'approved' || kind === 'rejected') {
        await api.post(`/api/client/conversations/${c.id}/approval`, { decision: kind });
        toast(kind === 'approved' ? 'Approved — your assistant has been notified.' : 'Rejected — it will not proceed.');
        await load();
      } else if (kind === 'handled') {
        await api.post(`/api/client/conversations/${c.id}/action`, { action: 'handled' });
        toast('Marked as handled.');
        navigate('/client');
      } else if (kind === 'ask') {
        await api.post(`/api/client/conversations/${c.id}/action`, { action: 'ask_assistant', note: note.trim() || undefined });
        toast(`${assistantFirst} will handle this from here.`);
        navigate('/client');
      }
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(null); }
  };

  return (
    <ClientShell>
      <Link to="/client" className="btn-ghost -ml-2"><ArrowLeft size={15} /> Needs your attention</Link>

      <div className="mt-3">
        <h1 className="text-[21px] sm:text-[24px] font-bold tracking-[-0.02em] text-ink leading-snug">{c.subject}</h1>
        <p className="mt-1.5 text-[11px] text-ink-muted">Last message {fullDateTime(c.last_activity_at)} · {messages.length} message{messages.length === 1 ? '' : 's'}{c.approval_status !== 'none' && <> · <ApprovalBadge approval={c.approval_status} /></>}</p>
      </div>

      {/* AI context — why this reached the client */}
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-4">
        <p className="flex items-center gap-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-brand-800"><Sparkles size={11} /> Why this needs you</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[#2B2B45]">{c.summary}</p>
        <p className="mt-2 flex items-start gap-2 text-[12px] leading-snug text-[#4a3a6b]"><ShieldQuestion size={14} className="shrink-0 mt-0.5" /><span><strong>Why you:</strong> {c.reason}</span></p>
        {c.suggested_action && <p className="mt-2 text-[12px] leading-snug text-brand-900"><strong>Suggested:</strong> {c.suggested_action}</p>}
      </div>

      {/* Thread */}
      <div className="card mt-4 px-5"><MessageThread messages={messages} /></div>

      {/* Decision bar */}
      <div className="card mt-4 p-4 sm:p-5">
        {c.approval_status === 'pending' ? (
          <>
            <h2 className="text-[13px] font-bold text-ink">Your decision</h2>
            <p className="mt-0.5 text-[11px] text-ink-secondary">This is the approval {assistantFirst} needs before acting. Choose one:</p>
            <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
              <button disabled={busy} onClick={() => act('approved')} className="h-12 rounded-xl bg-emerald-700 text-white font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-emerald-800 disabled:opacity-60 transition-colors">{busy === 'approved' ? <Loader2 size={16} className="animate-spin" /> : <Check size={17} />} Approve</button>
              <button disabled={busy} onClick={() => act('rejected')} className="h-12 rounded-xl bg-white border border-[#FECACA] text-[#B42318] font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-[#FEF2F2] disabled:opacity-60 transition-colors">{busy === 'rejected' ? <Loader2 size={16} className="animate-spin" /> : <X size={17} />} Reject</button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-[13px] font-bold text-ink">{c.approval_status === 'approved' ? 'You approved this' : c.approval_status === 'rejected' ? 'You rejected this' : 'No approval requested'}</h2>
            <p className="mt-0.5 text-[11px] text-ink-secondary">{c.approval_status === 'none' ? 'Review the thread, then close it out or hand it back.' : 'Decision recorded — your assistant has been notified.'}</p>
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <button className="btn-secondary" disabled={busy} onClick={() => act('handled')}>{busy === 'handled' ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />} Mark as handled</button>
          <button className="btn-ghost" disabled={busy} onClick={() => setAskMode((v) => !v)}><CornerUpLeft size={14} /> Ask {assistantFirst} to handle</button>
        </div>

        {askMode && (
          <form className="mt-2.5 animate-fade-up" onSubmit={(e) => { e.preventDefault(); act('ask'); }}>
            <label className="label" htmlFor="asknote">Note for {assistantFirst} (optional)</label>
            <textarea id="asknote" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Please push back on the fee and keep the timeline…" className="input !h-auto py-2" />
            <div className="mt-2 flex justify-end">
              <button type="submit" className="btn-primary" disabled={busy}>{busy === 'ask' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send to {assistantFirst}</button>
            </div>
          </form>
        )}
      </div>
      <p className="mt-4 text-center text-[10px] text-ink-muted">Every action updates your assistant’s workspace instantly.</p>
    </ClientShell>
  );
}
