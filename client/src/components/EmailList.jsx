// Searchable, filterable, selectable email list. Used by every list view.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, RotateCw, ChevronDown, Archive, MailOpen, Mail, Trash2, CircleCheck, X, Star } from 'lucide-react';
import api from '../api';
import { useToast } from '../context.jsx';
import { useWorkspace } from '../workspace.jsx';
import EmailRow from './EmailRow';
import { ConfirmModal } from './Modal';
import EmptyState from './EmptyState';

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'important', label: 'Important first' },
  { value: 'unread', label: 'Unread first' },
];

export default function EmailList({ filter = 'all', title, subtitle, emptyTitle, emptyBody }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const sort = searchParams.get('sort') || 'newest';
  const unreadOnly = searchParams.get('unread') === '1';
  const { clientId, refreshCounts } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [emails, setEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState(null); // 'bulk' | email object
  const [busyAction, setBusyAction] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/emails', { params: { filter, search: q, sort, clientId: clientId === 'all' ? undefined : clientId } });
      setEmails(data.emails);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, q, sort, clientId]); // eslint-disable-line

  useEffect(() => { load(); setSelected(new Set()); }, [load]);

  const visible = useMemo(() => (unreadOnly ? emails.filter((e) => !e.is_read) : emails), [emails, unreadOnly]);
  const allSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: true });
  };
  const toggleSelect = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(visible.map((e) => e.id)));

  const patchEmail = (id, patch) => setEmails((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const doAction = useCallback(async (email, action, payload) => {
    try {
      switch (action) {
        case 'toggleSelect': toggleSelect(email.id); return;
        case 'star': patchEmail(email.id, { is_starred: !email.is_starred }); await api.post(`/api/emails/${email.id}/star`, { starred: !email.is_starred }); break;
        case 'read': patchEmail(email.id, { is_read: !email.is_read }); await api.post(`/api/emails/${email.id}/read`, { read: !email.is_read }); break;
        case 'archive': {
          const undo = email.status === 'archived';
          setEmails((list) => list.filter((e) => e.id !== email.id));
          await api.post(`/api/emails/${email.id}/archive`, { undo });
          toast(undo ? 'Moved back to inbox' : 'Archived');
          break;
        }
        case 'complete':
          setEmails((list) => list.filter((e) => e.id !== email.id));
          await api.post(`/api/emails/${email.id}/complete`);
          toast('Marked as completed');
          break;
        case 'delete': setConfirmDelete(email); return;
        default: return;
      }
      refreshCounts();
    } catch (err) {
      toast(err.message, 'error');
      load();
    }
  }, [refreshCounts, load, toast]); // eslint-disable-line

  const bulk = async (action) => {
    setBusyAction(true);
    try {
      const ids = [...selected];
      await api.post('/api/emails/bulk', { ids, action });
      toast(`${action === 'delete' ? 'Deleted' : 'Updated'} ${ids.length} conversation${ids.length === 1 ? '' : 's'}`);
      setSelected(new Set());
      await load();
      refreshCounts();
    } catch (err) { toast(err.message, 'error'); } finally { setBusyAction(false); }
  };

  const deleteTargets = confirmDelete === 'bulk' ? [...selected] : confirmDelete ? [confirmDelete.id] : null;
  const performDelete = async () => {
    try {
      if (confirmDelete === 'bulk') await bulk('delete');
      else { await api.delete(`/api/emails/${confirmDelete.id}`); toast('Conversation deleted'); setEmails((l) => l.filter((e) => e.id !== confirmDelete.id)); refreshCounts(); }
    } catch (err) { toast(err.message, 'error'); }
    setConfirmDelete(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="px-4 sm:px-6 pt-5 pb-3 border-b border-hairline bg-app">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="mr-auto">
            <h1 className="text-[17px] font-bold tracking-tight text-ink">{title}</h1>
            <p className="text-[11px] text-ink-muted">{subtitle} · <span className="tabular-nums font-medium text-ink-secondary">{visible.length}</span> conversation{visible.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={load} className="btn-icon" title="Refresh" aria-label="Refresh"><RotateCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => updateParam('unread', unreadOnly ? '' : '1')} aria-pressed={unreadOnly}
            className={`h-8 px-3 rounded-lg text-[12px] font-medium border transition-colors ${unreadOnly ? 'bg-ink text-white border-ink' : 'bg-white border-hairline text-ink-secondary hover:text-ink'}`}>Unread only</button>
          <div className="relative">
            <select value={sort} onChange={(e) => updateParam('sort', e.target.value)} aria-label="Sort"
              className="appearance-none h-8 pl-3 pr-8 text-[12px] font-medium rounded-lg border border-hairline bg-white text-ink-secondary hover:text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-600/20">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted" />
          </div>
        </div>
        {q && (
          <div className="mt-2.5 flex items-center gap-2 text-[11px] text-ink-secondary">
            <Search size={12} /> Results for “<span className="font-semibold text-ink">{q}</span>”
            <button onClick={() => updateParam('q', '')} className="btn-icon !h-6 !w-6" aria-label="Clear search"><X size={13} /></button>
          </div>
        )}
      </div>

      {/* Column header / select-all */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-8 border-b border-hairline bg-[#FCFCFD]">
        <button onClick={toggleAll} aria-label="Select all" aria-pressed={allSelected}
          className={`w-[16px] h-[16px] rounded-[5px] border flex items-center justify-center transition-colors ${allSelected ? 'bg-brand-600 border-brand-600 text-white' : 'border-[#D4D4D9] bg-white text-transparent'}`}>
          <svg viewBox="0 0 12 12" className="w-[10px] h-[10px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6.5L4.8 9L10 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted">{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
        {selected.size > 0 && <button className="ml-auto text-[11px] font-medium text-ink-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear selection</button>}
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto relative pb-24">
        {loading && visible.length === 0 ? (
          <div className="p-4 space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[68px] rounded-lg bg-[#F0F0F3] animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <EmptyState title={emptyTitle || 'Nothing here'} body={emptyBody || 'When matching conversations arrive they will appear here.'} action={<button className="btn-secondary" onClick={() => navigate('/app/emails')}>View all emails</button>} />
        ) : (
          visible.map((email) => (
            <EmailRow key={email.id} email={email} selected={selected.has(email.id)} onToggleSelect={() => toggleSelect(email.id)} onAction={doAction} busy={busyAction} />
          ))
        )}

        {/* Bulk action dock */}
        {selected.size > 0 && (
          <div className="sticky bottom-4 z-10 mx-auto w-fit animate-fade-up">
            <div className="flex items-center gap-1.5 rounded-xl bg-ink text-white pl-3.5 pr-2 py-2 shadow-pop">
              <span className="text-[12px] font-semibold tabular-nums mr-1">{selected.size} selected</span>
              <button onClick={() => bulk('read')} className="h-8 px-2 rounded-lg text-[11.5px] hover:bg-white/10 flex items-center gap-1.5"><MailOpen size={14} />Read</button>
              <button onClick={() => bulk('unread')} className="h-8 px-2 rounded-lg text-[11.5px] hover:bg-white/10 flex items-center gap-1.5"><Mail size={14} />Unread</button>
              <button onClick={() => bulk('star')} className="h-8 px-2 rounded-lg text-[11.5px] hover:bg-white/10 flex items-center gap-1.5"><Star size={14} />Star</button>
              <button onClick={() => bulk('archive')} className="h-8 px-2 rounded-lg text-[11.5px] hover:bg-white/10 flex items-center gap-1.5"><Archive size={14} />Archive</button>
              <button onClick={() => bulk('complete')} className="h-8 px-2 rounded-lg text-[11.5px] hover:bg-white/10 flex items-center gap-1.5"><CircleCheck size={14} />Complete</button>
              <button onClick={() => setConfirmDelete('bulk')} className="h-8 px-2 rounded-lg text-[11.5px] text-red-300 hover:bg-white/10 flex items-center gap-1.5"><Trash2 size={14} />Delete</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Delete conversation?"
        body={confirmDelete === 'bulk' ? `This permanently deletes ${deleteTargets?.length || 0} conversation(s) and their messages. This cannot be undone.` : 'This permanently deletes the conversation and its messages. This cannot be undone.'}
        confirmLabel="Delete"
        onConfirm={performDelete}
      />
    </div>
  );
}
