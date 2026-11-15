// Settings: profile, AI behaviour, notifications, signature. Persisted server-side.
import { useEffect, useState } from 'react';
import { Settings, Loader2, Check, LogOut, Sparkles } from 'lucide-react';
import api from '../../api';
import { useAuth } from '../../context.jsx';
import { useToast } from '../../context.jsx';
import Avatar from '../../components/Avatar';

function Toggle({ checked, onChange, label, hint }) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between gap-4 py-3 text-left border-b border-hairline last:border-0">
      <span>
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {hint && <span className="block text-[11px] text-ink-muted mt-0.5 leading-snug">{hint}</span>}
      </span>
      <span className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${checked ? 'bg-brand-600' : 'bg-[#D9D9DE]'}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => { api.get('/api/settings').then(({ data }) => setSettings(data.settings)).catch(() => setSettings({})); }, []);

  const saveProfile = async () => {
    if (name.trim().length < 2) return toast('Name must be at least 2 characters.', 'error');
    setSavingProfile(true);
    try { await api.put('/api/auth/profile', { name: name.trim() }); toast('Profile updated.'); } catch (err) { toast(err.message, 'error'); } finally { setSavingProfile(false); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try { await api.put('/api/settings', settings); toast('Settings saved.'); } catch (err) { toast(err.message, 'error'); } finally { setSaving(false); }
  };

  if (!settings) return <div className="max-w-[760px] mx-auto p-6 space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-[#F0F0F3] animate-pulse" />)}</div>;

  const set = (key) => (value) => setSettings((s) => ({ ...s, [key]: value }));

  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><Settings size={19} className="text-brand-600" /> Settings</h1>
      <p className="mt-1 text-[12px] text-ink-secondary">Workspace preferences. Everything here persists — it’s not a mock.</p>

      {/* Profile */}
      <section className="card mt-5 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Profile</h2>
        <div className="mt-3 flex items-center gap-4">
          <Avatar name={name || user?.name} color={user?.avatar_color || '#4F46E5'} size={56} />
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-ink">{user?.name}</p>
            <p className="text-[11px] text-ink-muted">{user?.email} · Personal Assistant</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <div className="flex-1"><label className="label" htmlFor="sname">Display name</label><input id="sname" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="flex items-end"><button className="btn-secondary" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save</button></div>
        </div>
      </section>

      {/* AI behaviour */}
      <section className="card mt-4 p-5">
        <div className="flex items-center gap-2"><Sparkles size={14} className="text-brand-600" /><h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">AI behaviour</h2></div>
        <div className="mt-2">
          <Toggle checked={settings.auto_classify} onChange={set('auto_classify')} label="Auto-classify incoming mail" hint="New threads are routed to assistant / client / no-reply the moment they arrive." />
          <Toggle checked={settings.review_low_confidence} onChange={set('review_low_confidence')} label="Flag low-confidence threads for review" hint="Below 60% confidence, Relay asks a human instead of guessing." />
          <Toggle checked={settings.notify_high_importance} onChange={set('notify_high_importance')} label="High-importance alerts" hint="Desktop-style banner when urgent or time-sensitive mail lands." />
        </div>
        <div className="mt-3 rounded-lg bg-[#FCFCFD] border border-hairline px-3 py-2 text-[10.5px] text-ink-muted leading-snug">
          Current engine: {settings ? 'rule-based fallback (set OPENAI_API_KEY to switch to a full LLM — architecture already wired, see README).' : '—'}
        </div>
      </section>

      {/* Notifications */}
      <section className="card mt-4 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Notifications</h2>
        <div className="mt-2">
          <Toggle checked={settings.notify_client_actions} onChange={set('notify_client_actions')} label="Client action alerts" hint="When your client approves, rejects, handles or hands back a thread." />
          <Toggle checked={settings.weekly_digest} onChange={set('weekly_digest')} label="Weekly digest" hint="A Monday-morning summary of handled volume, pending approvals and follow-ups." />
        </div>
        <div className="mt-3">
          <label className="label" htmlFor="tz">Time zone</label>
          <select id="tz" className="input" value={settings.timezone} onChange={(e) => set('timezone')(e.target.value)}>
            {['Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Singapore'].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
      </section>

      {/* Signature */}
      <section className="card mt-4 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary">Email signature</h2>
        <p className="mt-1 text-[11px] text-ink-muted">Appended to AI drafts you send. Review before every send — nothing goes out unseen.</p>
        <textarea className="input mt-2 !h-auto py-2 leading-relaxed" rows={3} value={settings.signature || ''} onChange={(e) => set('signature')(e.target.value)} placeholder={'Warm regards,\nPriya Sharma\nAssistant to Rahul & Anita'} />
      </section>

      <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
        <button className="btn-ghost !text-[#B42318] hover:!bg-[#FEF2F2]" onClick={logout}><LogOut size={14} /> Sign out</button>
        <button className="btn-primary" onClick={saveSettings} disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save changes</button>
      </div>
    </div>
  );
}
