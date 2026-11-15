// Meetings & appointments — auto-extracted from threads, or added manually.
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, MapPin, Users, Trash2, Sparkles, PenLine, Video } from 'lucide-react';
import api from '../../api';
import { useToast } from '../../context.jsx';
import { useWorkspace } from '../../workspace.jsx';
import { Modal, ConfirmModal } from '../../components/Modal';
import EmptyState from '../../components/EmptyState';
import { meetingDay } from '../../utils';

export default function Meetings() {
  const { clientId, clients } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState({ clientId: '', title: '', date: '', time: '10:00', duration: '45', location: '', attendees: '' });

  const params = { clientId: clientId === 'all' ? undefined : clientId };
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/api/meetings', { params: { ...params, range: 'upcoming' } }); setMeetings(data.meetings); }
    catch (err) { toast(err.message, 'error'); } finally { setLoading(false); }
  }, [clientId]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!form.clientId && clients.length) setForm((f) => ({ ...f, clientId: String(clients[0].id) })); }, [clients]); // eslint-disable-line

  const submit = async (e) => {
    e.preventDefault();
    try {
      const start = new Date(`${form.date}T${form.time}`);
      if (Number.isNaN(start.getTime())) throw new Error('Pick a valid date and time.');
      const end = new Date(start.getTime() + Number(form.duration || 45) * 60000);
      await api.post('/api/meetings', { clientId: Number(form.clientId), title: form.title, start_at: start.toISOString(), end_at: end.toISOString(), location: form.location, attendees: form.attendees });
      toast('Meeting added.');
      setAddOpen(false);
      setForm((f) => ({ ...f, title: '', date: '', time: '10:00', location: '', attendees: '' }));
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async () => {
    try { await api.delete(`/api/meetings/${deleting.id}`); toast('Meeting removed.'); load(); } catch (err) { toast(err.message, 'error'); }
    setDeleting(null);
  };

  const inputCls = 'input';

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><CalendarDays size={19} className="text-brand-600" /> Meetings & Appointments</h1>
          <p className="mt-1 text-[12px] text-ink-secondary">Dates detected in email threads appear here automatically — plus anything you add by hand.</p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add meeting</button>
      </div>

      <div className="mt-5 space-y-2.5">
        {loading && meetings.length === 0 && [0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-[#F0F0F3] animate-pulse" />)}
        {!loading && meetings.length === 0 && (
          <EmptyState icon={CalendarDays} title="No upcoming meetings" body="Ask the AI to extract dates from threads, or add one manually." action={<button className="btn-primary" onClick={() => setAddOpen(true)}><Plus size={14} /> Add meeting</button>} />
        )}
        {meetings.map((m) => {
          const d = meetingDay(m.start_at);
          const isCall = /meet|call|zoom|video/i.test(m.location || '');
          return (
            <div key={m.id} className="card p-4 flex items-center gap-4 hover:shadow-lift transition-shadow">
              <div className="w-12 h-12 rounded-xl border border-hairline bg-[#FCFCFD] flex flex-col items-center justify-center shrink-0">
                <span className="text-[15px] font-bold leading-none text-ink">{d.day}</span>
                <span className="text-[8.5px] uppercase tracking-wider text-ink-muted">{d.month}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[13px] font-bold text-ink leading-snug">{m.title}</p>
                  <span className={`chip ${m.source === 'extracted' ? 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-100' : 'bg-[#F4F4F5] text-ink-secondary ring-1 ring-inset ring-hairline'}`}>
                    {m.source === 'extracted' ? <><Sparkles size={9} /> Detected from email</> : <><PenLine size={9} /> Manual</>}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-ink-secondary flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="font-semibold text-ink">{d.label} · {d.time}</span>
                  {m.location && <span className="flex items-center gap-1">{isCall ? <Video size={11} /> : <MapPin size={11} />}{m.location}</span>}
                  <span className="text-ink-muted">{m.client_name}</span>
                </p>
                {m.attendees && <p className="mt-0.5 text-[10px] text-ink-muted flex items-center gap-1"><Users size={10} />{m.attendees}</p>}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {m.conversation_id && <button onClick={() => navigate(`/app/email/${m.conversation_id}`)} className="text-[10.5px] font-semibold text-brand-700 hover:underline">Open thread →</button>}
                <button className="btn-icon !h-7 !w-7 hover:!text-[#B42318]" title="Remove meeting" onClick={() => setDeleting(m)}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a meeting">
        <form onSubmit={submit} className="space-y-3.5">
          <div>
            <label className="label" htmlFor="mtitle">Title</label>
            <input id="mtitle" autoFocus required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Board dinner — welcome address" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="mdate">Date</label><input id="mdate" required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={inputCls} /></div>
            <div className="col-span-1"><label className="label" htmlFor="mtime">Time</label><input id="mtime" required type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className={inputCls} /></div>
            <div className="col-span-1"><label className="label" htmlFor="mdur">Min</label><select id="mdur" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} className={inputCls}><option>15</option><option>30</option><option>45</option><option>60</option><option>90</option></select></div>
            <div className="col-span-2 sm:col-span-1"><label className="label" htmlFor="mclient">Client</label><select id="mclient" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={inputCls}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name.split(' ')[0]}</option>)}</select></div>
          </div>
          <div><label className="label" htmlFor="mloc">Location / link</label><input id="mloc" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Google Meet, The Oberoi, Rahul’s office…" className={inputCls} /></div>
          <div><label className="label" htmlFor="matt">Attendees</label><input id="matt" value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="Rahul Mehta, Neha Kapoor…" className={inputCls} /></div>
          <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Add meeting</button></div>
        </form>
      </Modal>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} title="Remove meeting?" danger body={`“${deleting?.title}” will be removed from the calendar. The source email thread is not affected.`} confirmLabel="Remove" onConfirm={remove} />
    </div>
  );
}
