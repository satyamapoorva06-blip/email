// Explicit opt-in: everything open in the client's mailbox, read-only context.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import ClientShell from '../../components/ClientShell';
import { ClassificationBadge } from '../../components/badges';
import EmptyState from '../../components/EmptyState';
import { listTime } from '../../utils';
import { Inbox } from 'lucide-react';

export default function ClientAllMail() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/client/conversations', { params: { includeAll: '1' } })
      .then(({ data }) => setRows(data.conversations))
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  return (
    <ClientShell>
      <Link to="/client" className="btn-ghost -ml-2"><ArrowLeft size={15} /> Back to your decisions</Link>
      <h1 className="mt-3 text-[22px] font-bold tracking-tight text-ink flex items-center gap-2"><Eye size={19} className="text-ink-muted" /> Everything in your inbox</h1>
      <p className="mt-1 text-[12px] text-ink-secondary">You asked to see it all — including automated mail your assistant files away. You can open any thread, but decisions stay on your approval cards.</p>

      <div className="card mt-4 divide-y divide-hairline overflow-hidden">
        {loading && [0, 1, 2, 3].map((i) => <div key={i} className="h-16 bg-[#F0F0F3] animate-pulse" />)}
        {!loading && rows.length === 0 && <EmptyState icon={Inbox} title="Inbox is empty" body="Nothing open right now." />}
        {rows.map((r) => (
          <button key={r.id} onClick={() => navigate(`/client/email/${r.id}`)} className="w-full text-left px-4 py-3.5 hover:bg-[#FCFCFE] transition-colors flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-ink truncate">{r.sender_name}</span>
              <span className="block text-[11px] text-ink-secondary truncate">{r.subject}</span>
              <span className="mt-1 inline-flex"><ClassificationBadge classification={r.classification} /></span>
            </span>
            <time className="text-[10px] text-ink-muted tabular-nums shrink-0">{listTime(r.last_activity_at)}</time>
          </button>
        ))}
      </div>
    </ClientShell>
  );
}
