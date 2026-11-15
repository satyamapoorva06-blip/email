import { useEffect } from 'react';
import { TriangleAlert, X } from 'lucide-react';

// Generic modal shell + themed confirm dialog.
export function Modal({ open, onClose, title, children, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-[#16161A]/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div role="dialog" aria-modal aria-label={title} className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-md'} bg-white rounded-t-2xl sm:rounded-2xl shadow-pop border border-hairline animate-fade-up max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-hairline sticky top-0 bg-white rounded-t-2xl sm:rounded-t-2xl">
          <h3 className="text-[14px] font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="btn-icon" aria-label="Close"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, title, body, confirmLabel = 'Delete', danger = true, onConfirm }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${danger ? 'bg-[#FEF2F2] text-[#B42318]' : 'bg-brand-50 text-brand-700'}`}>
          <TriangleAlert size={17} />
        </div>
        <p className="text-[13px] leading-relaxed text-ink-secondary">{body}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm?.(); onClose?.(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
