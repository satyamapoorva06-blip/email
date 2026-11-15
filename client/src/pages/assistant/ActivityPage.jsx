// Full activity timeline with actor filter.
import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import api from '../../api';
import { useWorkspace } from '../../workspace.jsx';
import ActivityTimeline from '../../components/ActivityTimeline';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'ai', label: 'AI' },
  { id: 'assistant', label: 'Assistant' },
  { id: 'client', label: 'Client' },
  { id: 'system', label: 'System' },
];

export default function ActivityPage() {
  const { clientId } = useWorkspace();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/api/activity', { params: { clientId: clientId === 'all' ? undefined : clientId, limit: 60 } })
      .then(({ data }) => setItems(data.activity))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [clientId]);

  const visible = filter === 'all' ? items : items.filter((i) => i.actor_role === filter);

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><Activity size={19} className="text-brand-600" /> Activity Timeline</h1>
      <p className="mt-1 text-[12px] text-ink-secondary">Every classification, override, client action and sent reply — newest first. This is the audit trail for “what did the AI do, and when?”</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={`h-8 px-3.5 rounded-full text-[12px] font-medium border transition-colors ${filter === f.id ? 'bg-ink text-white border-ink' : 'bg-white border-hairline text-ink-secondary hover:text-ink'}`}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="card mt-4 p-5">
        {loading ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-[#F0F0F3] animate-pulse" />)}</div> : <ActivityTimeline items={visible} />}
      </div>
    </div>
  );
}
