// Vertical activity feed. Actor role drives the icon + tint.
import { Sparkles, PenLine, User, Info } from 'lucide-react';
import { timeAgo } from '../utils';

const ACTOR = {
  ai: { icon: Sparkles, cls: 'bg-brand-50 text-brand-600 ring-brand-100', label: 'AI' },
  assistant: { icon: PenLine, cls: 'bg-[#EFF6FF] text-[#1D4ED8] ring-[#DBEAFE]', label: 'Assistant' },
  client: { icon: User, cls: 'bg-[#FFF7ED] text-[#C2410C] ring-[#FFEDD5]', label: 'Client' },
  system: { icon: Info, cls: 'bg-[#F4F4F5] text-[#52525B] ring-[#E4E4E7]', label: 'System' },
};

export default function ActivityTimeline({ items, compact = false }) {
  if (!items?.length) return <p className="text-[12px] text-ink-muted px-1 py-6 text-center">No activity yet — actions across both dashboards will appear here.</p>;
  return (
    <ol className="relative">
      {items.map((item, i) => {
        const a = ACTOR[item.actor_role] || ACTOR.system;
        const Icon = a.icon;
        return (
          <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < items.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-hairline" aria-hidden />}
            <span className={`relative z-10 w-[27px] h-[27px] rounded-full ring-1 flex items-center justify-center shrink-0 ${a.cls}`}>
              <Icon size={13} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[12px] leading-snug text-[#2B2B31]">
                {item.client_name && <span className="font-semibold">{item.client_name.split(' ')[0]} · </span>}{item.detail}
              </p>
              <p className="mt-0.5 text-[10px] text-ink-muted">{a.label} · {timeAgo(item.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
