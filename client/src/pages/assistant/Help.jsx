// Help & support: FAQ accordion, shortcuts, contact. All interactions work.
import { useState } from 'react';
import { LifeBuoy, ChevronDown, Keyboard, Mail, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

const FAQ = [
  { q: 'How does the AI decide who replies?', a: 'Every incoming thread is analysed against its subject, full body text and prior messages. Relay emits one of four outcomes — Assistant to reply, Client to reply, No reply needed, or Needs review — each with a confidence score, a written reason and a suggested next action. Business decisions (money, legal, hiring, strategy, sign-off) go to the client; logistics go to the assistant; automated mail is filed.' },
  { q: 'Can I override what the AI decided?', a: 'Yes. Open any thread and change the classification with the dropdown under “AI analysis”. The override is logged in the activity timeline, and “Re-analyze” re-checks the thread against the latest history at any time.' },
  { q: 'Will Relay ever send an email on its own?', a: 'Never. AI drafts land in the composer, you review and edit them, and only an explicit “Send reply” sends — simulated through the connected mailbox in this demo.' },
  { q: 'My client took an action — where do I see it?', a: 'Instantly, in the Notifications bell and in the Activity Timeline. The client’s “Mark handled” also closes the thread; “Ask assistant to handle” reclassifies it into your queue and drops a note for you.' },
  { q: 'The connections say “Simulated”. What does that mean?', a: 'This environment has no Google/Microsoft OAuth credentials configured, so connecting a mailbox creates a clearly-labelled simulated account — the flow, sync labels and data are realistic, but no real mail is accessed. Setting GOOGLE_CLIENT_ID / MICROSOFT_CLIENT_ID and reconnecting switches the same flow to real OAuth.' },
  { q: 'How do I give a client access to their surface?', a: 'As the assistant, open Manage clients (sidebar switcher), add the client and keep “create a linked client login” checked. They sign in with the shown credentials and land on a minimal page with only their pending decisions.' },
  { q: 'Why does a thread say “Needs review”?', a: 'Confidence fell below 60% — usually ambiguous money or legal language. Relay refuses to guess on those; you confirm the routing once and move on.' },
];

export default function Help() {
  const [open, setOpen] = useState(0);
  return (
    <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-[21px] font-bold tracking-tight text-ink flex items-center gap-2"><LifeBuoy size={19} className="text-brand-600" /> Help & Support</h1>
      <p className="mt-1 text-[12px] text-ink-secondary">Everything you need to run both dashboards confidently.</p>

      <section className="card mt-5 divide-y divide-hairline overflow-hidden">
        {FAQ.map((item, i) => (
          <div key={i}>
            <button className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 hover:bg-[#FCFCFD]" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span className="text-[13px] font-semibold text-ink">{item.q}</span>
              <ChevronDown size={16} className={`shrink-0 text-ink-muted transition-transform duration-200 ${open === i ? 'rotate-180' : ''}`} />
            </button>
            {open === i && <div className="px-5 pb-4 -mt-1"><p className="text-[12px] leading-relaxed text-ink-secondary max-w-prose">{item.a}</p></div>}
          </div>
        ))}
      </section>

      <div className="mt-4 grid sm:grid-cols-2 gap-4">
        <section className="card p-5">
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary"><Keyboard size={14} /> Keyboard shortcuts</h2>
          <ul className="mt-3 space-y-2 text-[12px] text-ink-secondary">
            <li className="flex items-center justify-between gap-2"><span>Focus search</span><span><kbd className="kbd">/</kbd> or <kbd className="kbd">⌘K</kbd></span></li>
            <li className="flex items-center justify-between gap-2"><span>Close dialogs / blur</span><span><kbd className="kbd">Esc</kbd></span></li>
            <li className="flex items-center justify-between gap-2"><span>Send reply from composer</span><span><kbd className="kbd">⌘</kbd>+<kbd className="kbd">↵</kbd></span></li>
            <li className="flex items-center justify-between gap-2"><span>Ask the AI panel</span><span><kbd className="kbd">Enter</kbd></span></li>
          </ul>
        </section>
        <section className="card p-5 flex flex-col">
          <h2 className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-secondary"><Mail size={14} /> Contact support</h2>
          <p className="mt-3 text-[12px] leading-relaxed text-ink-secondary">Stuck on anything? Email the Relay team — a human replies within one business day.</p>
          <a className="btn-dark mt-auto w-fit" href="mailto:support@relay.app?subject=Help%20with%20Relay"><Mail size={14} /> support@relay.app</a>
          <p className="mt-3 text-[10px] text-ink-muted flex items-center gap-1.5"><Sparkles size={10} className="text-brand-600" /> Tip: the Ask AI panel can answer most “why” questions right inside the inbox. <Link to="/app" className="text-brand-700 font-semibold hover:underline">Open overview</Link></p>
        </section>
      </div>
    </div>
  );
}
