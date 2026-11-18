// Conversation detail: full thread + AI analysis + review-gated AI composer.
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Star, Mail, MailOpen, Archive, Trash2, CircleCheck, Send, Wand2,
  Sparkles, CornerDownLeft, ShieldCheck, RotateCw, CalendarPlus, ChevronDown, Check,
} from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import { useWorkspace } from '../../workspace.jsx';
import Avatar from '../../components/Avatar';
import MessageThread from '../../components/MessageThread';
import { ConfirmModal } from '../../components/Modal';
import { ClassificationBadge, ReviewBadge, ApprovalBadge, ConfidenceBar, StatusBadge } from '../../components/badges';
import { fullDateTime } from '../../utils';

const CLASS_OPTIONS = [
  { value: 'assistant', label: 'Assistant to reply' },
  { value: 'client', label: 'Client to reply' },
  { value: 'none', label: 'No reply needed' },
];

export default function EmailDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { setClientId, refreshCounts } = useWorkspace();

  const [data, setData] = useState(null);
  const [health, setHealth] = useState('fallback');
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const composerRef = useRef(null);

  const load = async () => {
    try {
      const res = await api.get(`/api/emails/${id}`);
      setData(res.data);
    } catch (err) {
      toast(err.message, 'error');
      navigate('/app/emails');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  useEffect(() => { api.get('/api/health').then(({ data }) => setHealth(data.ai)).catch(() => {}); }, []);

  if (loading || !data) {
    return <div className="max-w-5xl mx-auto p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-[#F0F0F3] animate-pulse" />)}</div>;
  }

  const { conversation: c, messages, client } = data;
  const busy = genBusy || sending || reanalyzing;

  const mutate = async (fn, okMessage) => {
    try { await fn(); okMessage && toast(okMessage); await load(); refreshCounts(); } catch (err) { toast(err.message, 'error'); }
  };

  const generateDraft = async () => {
    setGenBusy(true);
    try {
      const { data } = await api.post(`/api/emails/${c.id}/generate-reply`);
      setDraft(data.text);
      toast(data.engine === 'llm' ? 'AI draft ready — review before sending.' : 'Draft ready (rule-based engine — no LLM key configured).', 'info');
      composerRef.current?.focus();
    } catch (err) { toast(err.message, 'error'); } finally { setGenBusy(false); }
  };

  const send = async () => {
    if (!draft.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/emails/${c.id}/reply`, { body: draft.trim() });
      setDraft('');
      toast(`Reply sent from ${client?.name?.split(' ')[0]}’s mailbox (simulated).`);
      await load(); refreshCounts();
    } catch (err) { toast(err.message, 'error'); } finally { setSending(false); }
  };

  const reanalyze = () => mutate(async () => {
    setReanalyzing(true);
    try { await api.post(`/api/emails/${c.id}/reanalyze`); toast('AI re-analyzed the thread with the latest messages.'); } finally { setReanalyzing(false); }
  });

  const changeClassification = (classification) => mutate(() => api.put(`/api/emails/${c.id}/classification`, { classification }), 'Classification overridden manually.');

  const extractMeeting = () => mutate(async () => {
    const { data } = await api.post(`/api/emails/${c.id}/extract-meeting`);
    if (data.created) toast('Meeting added to the calendar.');
    else toast(data.reason || 'No meeting detected in this thread.', 'info');
  });

  const remove = async () => {
    await api.delete(`/api/emails/${c.id}`);
    toast('Conversation deleted.');
    refreshCounts();
    navigate('/app/emails');
  };

  const action = 'h-8 w-8 inline-flex items-center justify-center rounded-lg border border-hairline bg-white text-ink-secondary hover:text-ink hover:border-[#D5D5DB] transition-colors disabled:opacity-40';

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5">
      {/* Header */}
      <button onClick={() => navigate(-1)} className="btn-ghost -ml-2"><ArrowLeft size={15} /> Back</button>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] sm:text-[20px] font-bold tracking-tight text-ink leading-snug">{c.subject}</h1>
            <StatusBadge status={c.status} />
            {c.external_id && <span className="chip bg-[#EFF6FF] text-[#1D4ED8] ring-1 ring-inset ring-[#BFDBFE]" title="Live thread imported from the connected Gmail mailbox">Gmail</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
            <Avatar name={client?.name} color={client?.avatar_color} size={18} />
            <span className="font-medium text-ink-secondary">{client?.name} · {client?.company}</span>
            <span aria-hidden>·</span><span>Last activity {fullDateTime(c.last_activity_at)}</span>
            <span aria-hidden>·</span><span>{messages.length} message{messages.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className={action} title={c.is_starred ? 'Unstar' : 'Star'} aria-pressed={c.is_starred} onClick={() => mutate(() => api.post(`/api/emails/${c.id}/star`, { starred: !c.is_starred }))}>
            <Star size={15} className={c.is_starred ? 'text-amber-500 fill-amber-400' : ''} />
          </button>
          <button className={action} title={c.is_read ? 'Mark as unread' : 'Mark as read'} onClick={() => mutate(() => api.post(`/api/emails/${c.id}/read`, { read: !c.is_read }))}>
            {c.is_read ? <Mail size={15} /> : <MailOpen size={15} />}
          </button>
          <button className={action} title={c.status === 'archived' ? 'Unarchive' : 'Archive'} onClick={() => mutate(() => api.post(`/api/emails/${c.id}/archive`, { undo: c.status === 'archived' }), c.status === 'archived' ? 'Moved to inbox' : 'Archived')}>
            <Archive size={15} />
          </button>
          <button className={action} title="Mark completed" onClick={() => mutate(() => api.post(`/api/emails/${c.id}/complete`), 'Marked as completed')}>
            <CircleCheck size={15} />
          </button>
          <button className={`${action} hover:!text-[#B42318]`} title="Delete" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="mt-4 grid xl:grid-cols-[minmax(0,1fr)_330px] gap-4 items-start">
        {/* Thread + composer */}
        <div className="space-y-4 min-w-0">
          <div className="card overflow-hidden">
            <div className="px-5 divide-y divide-hairline"><MessageThread messages={messages} /></div>
          </div>

          {/* Composer */}
          <div className="card p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Reply to {client?.name?.split(' ')[0]}</h2>
              <button onClick={generateDraft} disabled={genBusy} className="ml-auto h-8 px-2.5 rounded-lg text-[11.5px] font-semibold text-brand-800 bg-brand-50 hover:bg-brand-100 transition-colors flex items-center gap-1.5 disabled:opacity-60">
                {genBusy ? <RotateCw size={13} className="animate-spin" /> : <Wand2 size={13} />} Generate AI draft
              </button>
            </div>
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send(); }}
              rows={4}
              placeholder="Write your reply…"
              className="mt-3 w-full resize-y min-h-[96px] rounded-lg border border-hairline p-3 text-[13px] leading-relaxed outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/15 placeholder:text-ink-muted"
              aria-label="Reply body"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] text-ink-muted"><ShieldCheck size={11} className="text-emerald-600" /> AI drafts are never sent without your approval. <kbd className="kbd">⌘↵</kbd> to send</span>
              <div className="ml-auto flex items-center gap-2">
                {draft && <button className="btn-ghost" onClick={() => setDraft('')}>Clear</button>}
                <button className="btn-primary" onClick={send} disabled={!draft.trim() || sending}>
                  {sending ? <RotateCw size={14} className="animate-spin" /> : <Send size={14} />} Send reply
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* AI analysis rail */}
        <aside className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-brand-600" />
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">AI analysis</h2>
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-ink-muted border border-hairline rounded px-1.5 py-0.5">{health === 'llm' ? 'LLM' : 'Rules'}</span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <ClassificationBadge classification={c.classification} />
              {c.needs_review && <ReviewBadge />}
              {c.approval_status !== 'none' && <ApprovalBadge approval={c.approval_status} />}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[10px] font-medium text-ink-muted uppercase tracking-wide">Confidence</span>
              <ConfidenceBar value={c.confidence} />
            </div>

            {c.needs_review && (
              <p className="mt-3 text-[11px] leading-snug text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2">Low confidence — please confirm the routing. Your override is remembered for this thread.</p>
            )}

            <div className="mt-3.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Summary</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#2B2B31]">{c.summary}</p>
            </div>
            <div className="mt-3.5">
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Why this classification</h3>
              <p className="mt-1 text-[12px] leading-relaxed text-[#2B2B31]">{c.reason}</p>
            </div>
            <div className="mt-3.5 rounded-lg bg-brand-50 border border-brand-100 px-3 py-2.5 flex items-start gap-2">
              <CornerDownLeft size={13} className="text-brand-700 mt-0.5 shrink-0" />
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-800">Suggested next action</h3>
                <p className="mt-0.5 text-[12px] leading-snug text-brand-900">{c.suggested_action}</p>
              </div>
            </div>

            {/* Override */}
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <select value={c.classification} onChange={(e) => changeClassification(e.target.value)} aria-label="Override classification"
                  className="w-full appearance-none h-9 pl-3 pr-8 text-[12px] font-medium rounded-lg border border-hairline bg-white text-ink focus:outline-none focus:ring-2 focus:ring-brand-600/20 cursor-pointer">
                  {CLASS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" />
              </div>
              <button className="btn-secondary" onClick={reanalyze} disabled={reanalyzing} title="Re-run AI on the full thread">
                <RotateCw size={14} className={reanalyzing ? 'animate-spin' : ''} /> Re-analyze
              </button>
            </div>
            <button onClick={extractMeeting} className="mt-2 w-full h-8 rounded-lg text-[11px] font-medium text-ink-secondary hover:text-ink hover:bg-[#F5F5F7] flex items-center justify-center gap-1.5">
              <CalendarPlus size={13} /> Extract meeting from this thread
            </button>
          </div>

          {/* Client card */}
          <div className="card p-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">Workspace</h2>
            <div className="mt-2 flex items-center gap-2.5">
              <Avatar name={client?.name} color={client?.avatar_color} size={34} />
              <div className="min-w-0">
                <p className="text-[12px] font-bold text-ink leading-tight">{client?.name}</p>
                <p className="text-[10px] text-ink-muted truncate">{client?.role_title} · {client?.company}</p>
              </div>
            </div>
            <button className="mt-3 w-full h-8 rounded-lg border border-hairline text-[11px] font-medium text-ink-secondary hover:text-ink hover:border-[#D5D5DB] flex items-center justify-center gap-1.5"
              onClick={() => { setClientId(client.id); navigate('/app/emails'); }}>
              Switch to this workspace <ArrowLeft size={12} className="rotate-180" />
            </button>
            {c.approval_status === 'pending' && (
              <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-snug text-[#92400E]">
                <strong>{client?.name?.split(' ')[0]}’s approval is pending.</strong> You’ll be notified the moment they decide — the thread will update automatically.
              </div>
            )}
          </div>
        </aside>
      </div>

      <ConfirmModal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete conversation?"
        body="This permanently deletes the conversation and its messages — including the AI analysis. This cannot be undone."
        confirmLabel="Delete forever" onConfirm={remove} />
    </div>
  );
}
