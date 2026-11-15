import { Inbox } from 'lucide-react';

export default function EmptyState({ icon: Icon = Inbox, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-12 h-12 rounded-2xl bg-[#F1F1F4] flex items-center justify-center text-ink-muted">
        <Icon size={20} strokeWidth={1.75} />
      </div>
      <h3 className="mt-4 text-[14px] font-semibold text-ink">{title}</h3>
      {body && <p className="mt-1 text-[12px] text-ink-muted max-w-xs leading-relaxed">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
