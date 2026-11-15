// Renders the full message history of a conversation. Shared by the assistant
// detail view and the client review view so both always look identical.
import { FileText, FileSpreadsheet, FileImage, File, Paperclip, User, StickyNote } from 'lucide-react';
import Avatar from './Avatar';
import { fullDateTime, fileSize } from '../utils';

const kindIcon = (kind) => {
  if (kind === 'pdf' || kind === 'doc') return <FileText size={15} className="text-red-500" />;
  if (kind === 'sheet') return <FileSpreadsheet size={15} className="text-emerald-600" />;
  if (kind === 'image') return <FileImage size={15} className="text-violet-500" />;
  return <File size={15} className="text-ink-muted" />;
};

// Attachments are simulated locally: clicking downloads a small placeholder
// file generated in the browser (no server round-trip needed, works offline).
function downloadAttachment(att) {
  const blob = new Blob([`Relay — demo attachment\n\n${att.filename}\n${fileSize(att.size_bytes)}\n\nThis is a sample attachment bundled with the demo workspace.`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = att.filename; a.click();
  URL.revokeObjectURL(url);
}

export default function MessageThread({ messages }) {
  return (
    <div className="divide-y divide-hairline">
      {messages.map((m) => {
        if (m.direction === 'note') {
          return (
            <div key={m.id} className="py-4">
              <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#92400E]"><StickyNote size={12} /> Note from {m.sender_name.replace(' (note to assistant)', '')}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#78350F] whitespace-pre-wrap">{m.body}</p>
                <div className="mt-2 text-[10px] text-[#B45309]/70">{fullDateTime(m.created_at)}</div>
              </div>
            </div>
          );
        }
        const outbound = m.direction === 'outbound';
        return (
          <article key={m.id} className="py-5">
            <div className="flex items-start gap-3">
              {outbound
                ? <div className="w-9 h-9 rounded-full bg-ink flex items-center justify-center shrink-0"><User size={16} className="text-white" /></div>
                : <Avatar name={m.sender_name} color="#334155" size={36} />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-semibold text-ink">{m.sender_name}</span>
                  <span className="text-[11px] text-ink-muted truncate">&lt;{m.sender_email}&gt;</span>
                  {outbound && <span className="text-[10px] font-medium uppercase tracking-wide text-brand-700 bg-brand-50 rounded px-1 py-0.5">Sent via Relay</span>}
                  <time className="ml-auto text-[11px] text-ink-muted whitespace-nowrap">{fullDateTime(m.created_at)}</time>
                </div>
                <p className="mt-2 text-[13px] leading-[1.65] text-[#2B2B31] whitespace-pre-wrap">{m.body}</p>
                {m.attachments?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <button key={a.id} onClick={() => downloadAttachment(a)}
                        className="group flex items-center gap-2.5 pl-2 pr-3 h-11 rounded-lg border border-hairline bg-[#FCFCFD] hover:border-brand-300 hover:bg-brand-50 transition-colors text-left"
                        title="Download attachment">
                        <span className="w-7 h-7 rounded-md bg-white border border-hairline flex items-center justify-center">{kindIcon(a.kind)}</span>
                        <span>
                          <span className="block text-[11px] font-medium text-ink max-w-[180px] truncate">{a.filename}</span>
                          <span className="block text-[10px] text-ink-muted">{fileSize(a.size_bytes)}</span>
                        </span>
                        <Paperclip size={12} className="text-ink-muted group-hover:text-brand-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
