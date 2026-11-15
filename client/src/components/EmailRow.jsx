// One compact, readable email row for the list views.
import { Link } from 'react-router-dom';
import { Star, Flag, Paperclip, Archive, MailOpen, Mail, Trash2, CircleCheck } from 'lucide-react';
import Avatar from './Avatar';
import { ClassificationBadge, ReviewBadge, StatusBadge, ApprovalBadge } from './badges';
import { listTime } from '../utils';

export default function EmailRow({ email, selected, onToggleSelect, onAction, busy }) {
  const e = email;
  const act = (name, payload) => (ev) => { ev.preventDefault(); ev.stopPropagation(); onAction(e, name, payload); };

  return (
    <div className={`group relative flex items-center gap-3 pl-3 pr-2 sm:pl-4 sm:pr-3 min-h-[68px] py-2.5 border-b border-hairline transition-colors ${selected ? 'bg-brand-50/50' : 'hover:bg-[#FCFCFE]'} ${!e.is_read ? '' : 'opacity-90'}`}>
      {/* bulk checkbox */}
      <button
        onClick={act('toggleSelect')}
        aria-label={selected ? 'Deselect' : 'Select'}
        aria-pressed={selected}
        className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-brand-600 border-brand-600 text-white' : 'border-[#D4D4D9] bg-white text-transparent hover:border-brand-500'}`}>
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 6.5L4.8 9L10 3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>

      <Link to={`/app/email/${e.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <div className="relative shrink-0">
          <Avatar name={e.sender_name} color="#3F3F46" size={36} />
          {!e.is_read && <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-brand-600 ring-2 ring-white" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-[12.5px] truncate max-w-[38%] ${e.is_read ? 'font-medium text-ink-secondary' : 'font-semibold text-ink'}`}>{e.sender_name}</span>
            <span className="hidden md:block text-[10.5px] text-ink-muted truncate">{e.sender_email}</span>
            {e.approval_status !== 'none' && <ApprovalBadge approval={e.approval_status} className="hidden sm:inline-flex" />}
            <time className="ml-auto text-[10.5px] text-ink-muted tabular-nums whitespace-nowrap group-hover:opacity-0">{listTime(e.last_activity_at)}</time>
          </div>
          <div className="mt-0.5 flex items-center gap-2 min-w-0">
            <span className={`text-[12px] truncate ${e.is_read ? 'text-ink-secondary' : 'font-semibold text-ink'}`}>{e.subject}</span>
            {e.importance === 'high' && <Flag size={11} className="text-[#DC2626] shrink-0 fill-[#DC2626]" />}
            {e.attachment_count > 0 && <Paperclip size={11} className="text-ink-muted shrink-0" />}
          </div>
          <div className="mt-1 flex items-center gap-1.5 min-w-0">
            <ClassificationBadge classification={e.classification} />
            {e.needs_review && <ReviewBadge />}
            <StatusBadge status={e.status} />
            <span className="hidden lg:inline text-[10.5px] text-ink-muted truncate ml-1">— {e.preview}</span>
          </div>
        </div>
      </Link>

      {/* star + hover actions */}
      <div className="absolute right-3 top-2 flex items-center gap-0.5">
        <button onClick={act('star')} aria-label={e.is_starred ? 'Unstar' : 'Star'} aria-pressed={e.is_starred}
          className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${e.is_starred ? 'text-amber-500' : 'text-ink-muted hover:text-amber-500 opacity-100 sm:opacity-0 sm:group-hover:opacity-100'}`}>
          <Star size={15} className={e.is_starred ? 'fill-amber-400' : ''} />
        </button>
      </div>
      <div className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 items-center gap-0.5 bg-white/95 backdrop-blur rounded-lg border border-hairline shadow-card px-1 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={act('read')} className="btn-icon !h-7 !w-7" title={e.is_read ? 'Mark as unread' : 'Mark as read'}>{e.is_read ? <Mail size={15} /> : <MailOpen size={15} />}</button>
        <button onClick={act('complete')} className="btn-icon !h-7 !w-7" title="Mark complete"><CircleCheck size={15} /></button>
        <button onClick={act('archive')} className="btn-icon !h-7 !w-7" title={e.status === 'archived' ? 'Unarchive' : 'Archive'}><Archive size={15} /></button>
        <button onClick={act('delete')} className="btn-icon !h-7 !w-7 hover:!text-[#B42318]" title="Delete"><Trash2 size={15} /></button>
      </div>
    </div>
  );
}
