// Split-screen shell for the auth pages: dark pitch panel + light form panel.
import Logo from './Logo';
import { Sparkles, Inbox, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AuthShell({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-white">
      {/* Pitch panel */}
      <div className="relative hidden lg:flex flex-col bg-[#141419] text-white px-12 py-8 overflow-hidden">
        <Link to="/" className="flex items-center gap-2.5 w-fit">
          <Logo size={28} />
          <span className="text-[16px] font-bold tracking-tight">Relay</span>
        </Link>
        <div className="mt-auto max-w-md">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[#8E8EA6]">AI Email Operations</p>
          <h1 className="mt-3 text-[36px] leading-[1.12] font-bold tracking-[-0.02em]">The inbox that decides who replies.</h1>
          <ul className="mt-8 space-y-4 text-[13px] text-[#C7C7D4]">
            {[
              { icon: Sparkles, text: 'Every thread classified — assistant, client, or no-reply — with a written reason and confidence score.' },
              { icon: Inbox, text: 'One calm queue for the assistant: approvals, follow-ups, meetings and important mail, all in place.' },
              { icon: UserCheck, text: 'Clients see only what needs them — and their decision updates your workspace instantly.' },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="w-7 h-7 rounded-lg bg-white/[0.07] flex items-center justify-center shrink-0 mt-0.5"><Icon size={14} className="text-[#A5B4FC]" /></span>
                <span className="leading-relaxed">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-12 mb-2 flex items-center gap-3 text-[10.5px] text-[#7A7A8C]">
          <span>Demo workspaces included</span><span aria-hidden>·</span><span>No setup required</span>
        </div>
        {/* faint decorative envelope grid */}
        <svg className="pointer-events-none absolute -right-24 top-1/3 opacity-[0.05]" width="520" height="520" viewBox="0 0 200 200" fill="none">
          <rect x="10" y="30" width="180" height="140" rx="14" stroke="white" strokeWidth="3" />
          <path d="M14 44l86 62 86-62" stroke="white" strokeWidth="3" />
        </svg>
      </div>
      {/* Form panel */}
      <div className="flex items-center justify-center px-4 sm:px-8 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
