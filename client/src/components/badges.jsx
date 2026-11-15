import { Bot, Flag, Archive, CircleCheck } from 'lucide-react';

const STYLES = {
  assistant: { label: 'Assistant to reply', cls: 'bg-[#EFF4FF] text-[#1D4ED8] ring-[#D7E3FF]', dot: '#2563EB' },
  client: { label: 'Client to reply', cls: 'bg-[#FFF6EA] text-[#B45309] ring-[#F5E0C2]', dot: '#D97706' },
  none: { label: 'No reply needed', cls: 'bg-[#F4F4F5] text-[#52525B] ring-[#E4E4E7]', dot: '#71717A' },
};

export function ClassificationBadge({ classification, className = '' }) {
  const s = STYLES[classification] || STYLES.assistant;
  return (
    <span className={`chip ring-1 ring-inset ${s.cls} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

export function ReviewBadge() {
  return (
    <span className="chip bg-[#FFFBEB] text-[#92400E] ring-1 ring-inset ring-[#FDE68A]">
      <Flag size={10} strokeWidth={2.5} /> Needs review
    </span>
  );
}

export function StatusBadge({ status }) {
  if (status === 'completed') return <span className="chip bg-[#ECFDF5] text-[#047857] ring-1 ring-inset ring-[#A7F3D0]"><CircleCheck size={11} strokeWidth={2.5} /> Completed</span>;
  if (status === 'archived') return <span className="chip bg-[#F4F4F5] text-[#52525B] ring-1 ring-inset ring-[#E4E4E7]"><Archive size={10} /> Archived</span>;
  return null;
}

export function ApprovalBadge({ approval }) {
  const map = {
    pending: { label: 'Approval pending', cls: 'bg-[#FFFBEB] text-[#92400E] ring-[#FDE68A]' },
    approved: { label: 'Approved', cls: 'bg-[#ECFDF5] text-[#047857] ring-[#A7F3D0]' },
    rejected: { label: 'Rejected', cls: 'bg-[#FEF2F2] text-[#B42318] ring-[#FECACA]' },
  };
  const s = map[approval];
  if (!s) return null;
  return <span className={`chip ring-1 ring-inset ${s.cls}`}>{s.label}</span>;
}

export function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const tone = pct >= 80 ? '#059669' : pct >= 60 ? '#D97706' : '#DC2626';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-28 rounded-full bg-[#ECECF0] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: tone }} />
      </div>
      <span className="text-[11px] font-semibold tabular-nums" style={{ color: tone }}>{pct}%</span>
    </div>
  );
}

export function EngineNote({ engine }) {
  return engine === 'llm'
    ? <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-700 bg-brand-50 ring-1 ring-inset ring-brand-100 rounded px-1.5 py-0.5"><Bot size={10} /> LLM analysis</span>
    : <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-secondary bg-[#F4F4F5] ring-1 ring-inset ring-hairline rounded px-1.5 py-0.5">Rule-based analysis</span>;
}
