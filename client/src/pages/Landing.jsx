// Public landing page — confident, minimal, product-first.
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles, Inbox, UserCheck, ShieldCheck, Check } from 'lucide-react';
import Logo from '../components/Logo';
import { ClassificationBadge } from '../components/badges';

export default function Landing() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-app text-ink">
      {/* Nav */}
      <header className="h-16 border-b border-hairline/80">
        <div className="max-w-6xl mx-auto h-full flex items-center gap-3 px-4 sm:px-6">
          <Logo size={26} />
          <span className="text-[15px] font-bold tracking-tight">Relay</span>
          <nav className="ml-auto flex items-center gap-2">
            <Link to="/login" className="btn-ghost">Sign in</Link>
            <Link to="/register" className="btn-primary">Create workspace <ArrowRight size={14} /></Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 h-7 pl-1.5 pr-3 rounded-full border border-hairline bg-white shadow-card text-[11px] font-medium text-ink-secondary">
            <span className="w-4 h-4 rounded-full bg-brand-50 flex items-center justify-center"><Sparkles size={10} className="text-brand-600" /></span>
            AI triage for executive inboxes
          </div>
          <h1 className="mt-5 text-[40px] leading-[1.08] sm:text-[54px] font-bold tracking-[-0.03em] text-ink">
            Every email,<br />decided.
          </h1>
          <p className="mt-5 text-[15px] sm:text-[16px] leading-relaxed text-ink-secondary max-w-md">
            Relay reads each conversation in your client’s inbox and decides who should respond — you, them, or nobody. Your assistant works the queue; your client only sees what needs them.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link to="/register" className="btn-dark h-11 px-5 text-[14px]">Start free <ArrowRight size={15} /></Link>
            <button className="btn-secondary h-11 px-5 text-[14px]" onClick={() => navigate('/login', { state: { demo: true } })}>Explore the live demo</button>
          </div>
          <dl className="mt-8 flex items-center gap-6 text-[11px] text-ink-muted">
            {['Two demo workspaces included', 'No credit card required', 'Your data stays yours'].map((t) => (
              <div key={t} className="flex items-center gap-1.5"><Check size={12} className="text-emerald-600" strokeWidth={3} />{t}</div>
            ))}
          </dl>
        </div>

        {/* Product preview (static, honest mock of the real UI) */}
        <div className="relative" aria-hidden>
          <div className="card shadow-pop rounded-2xl overflow-hidden">
            <div className="h-9 border-b border-hairline bg-[#FCFCFD] flex items-center gap-1.5 px-3.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E7]" /><span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E7]" /><span className="w-2.5 h-2.5 rounded-full bg-[#E4E4E7]" />
              <span className="mx-auto text-[9px] font-medium text-ink-muted">relay.app — Rahul’s inbox</span>
            </div>
            <div className="p-3 space-y-1.5">
              {[
                { from: 'Vikram Rao · Northgate Legal', subject: 'Project Halcyon — revised term sheet for sign-off', badge: 'client', time: '9:02 AM', unread: true },
                { from: 'The Oberoi — Events', subject: 'Catering for the board dinner — 27th', badge: 'assistant', time: 'Yesterday', unread: false },
                { from: 'Meera Krishnan · Arclight', subject: 'Confirm whether we should proceed with the partnership', badge: 'client', time: 'Yesterday', unread: true },
                { from: 'Figma Billing', subject: 'Your invoice — payment received', badge: 'none', time: 'Mon', unread: false },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-hairline px-3 py-2.5 bg-white">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-semibold text-ink truncate">{row.from}</p>
                      <span className="text-[9px] text-ink-muted whitespace-nowrap">{row.time}</span>
                    </div>
                    <p className="text-[10.5px] text-ink-secondary truncate mt-0.5">{row.subject}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <ClassificationBadge classification={row.badge} />
                      {row.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand-600" />}
                    </div>
                  </div>
                </div>
              ))}
              <div className="rounded-lg bg-[#F4F4F7] px-3 py-2.5 text-[10px] leading-relaxed text-ink-secondary">
                <span className="font-semibold text-ink">AI summary — Halcyon term sheet:</span> sign-off needed by Thursday; founder equity re-vests over 4 years. Forwarded to Rahul for decision — nothing sent yet.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-t border-hairline bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-3 gap-8">
          {[
            { icon: Inbox, title: '1 · Relay triages everything', body: 'Each conversation is classified as assistant-to-reply, client-to-reply or no-reply — with a confidence score and a written reason you can audit.' },
            { icon: UserCheck, title: '2 · Humans approve decisions', body: 'Anything involving money, legal, hiring or strategy goes to your client with a plain-English summary. Nothing leaves the outbox unapproved.' },
            { icon: ShieldCheck, title: '3 · Both dashboards stay in sync', body: 'When the client marks something handled or asks for help, your assistant workspace updates instantly — same data, two lenses.' },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title}>
              <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-700 flex items-center justify-center"><Icon size={18} strokeWidth={2} /></div>
              <h3 className="mt-3 text-[14px] font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-secondary">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-hairline">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between text-[10.5px] text-ink-muted">
          <span>© 2026 Relay Systems · Crafted for executive teams</span>
          <span>Assistant workspace + Client surface</span>
        </div>
      </footer>
    </div>
  );
}
