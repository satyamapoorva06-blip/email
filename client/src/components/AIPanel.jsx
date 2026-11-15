// Relay AI — the assistant panel. Grounded in live inbox data (never invents).
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sparkles, X, ArrowUp, Loader2, Trash2 } from 'lucide-react';
import api from '../api';
import { useWorkspace } from '../workspace.jsx';

const SUGGESTED = [
  'Which emails need my attention?',
  'Summarize my unread emails',
  'Which conversations are waiting for a response?',
  'What meetings are scheduled this week?',
];
const CONVO_SUGGESTED = ['Why does this email require client attention?', 'Draft a professional reply', 'Re-check the classification'];

export default function AIPanel({ open, onClose }) {
  const location = useLocation();
  const { clientId } = useWorkspace();
  const conversationMatch = location.pathname.match(/^\/app\/email\/(\d+)/);
  const conversationId = conversationMatch ? Number(conversationMatch[1]) : null;

  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Hi! I read your live inbox, so answers are always up to date. Ask me anything — or tap a suggestion below.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, open]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setInput('');
    setBusy(true);
    try {
      const { data } = await api.post('/api/ai/chat', {
        question: q,
        clientId: clientId === 'all' ? null : Number(clientId),
        conversationId,
      });
      setMessages((m) => [...m, { role: 'assistant', text: data.answer, engine: data.engine }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: `I couldn’t answer that just now: ${err.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const suggestionList = conversationId ? CONVO_SUGGESTED : SUGGESTED;

  const body = (
    <div className="flex flex-col h-full bg-white border-l border-hairline">
      <div className="h-14 px-4 flex items-center gap-2.5 border-b border-hairline shrink-0">
        <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center"><Sparkles size={15} className="text-white" /></div>
        <div className="leading-tight flex-1">
          <div className="text-[13px] font-bold text-ink">Relay AI</div>
          <div className="text-[10px] text-ink-muted">Grounded in your live inbox</div>
        </div>
        <button className="btn-icon" title="Clear conversation" aria-label="Clear conversation"
          onClick={() => setMessages([{ role: 'assistant', text: 'Cleared. What would you like to know?' }])}>
          <Trash2 size={16} />
        </button>
        <button className="btn-icon" onClick={onClose} aria-label="Close panel"><X size={17} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' ? (
              <div className="max-w-[88%] rounded-2xl rounded-tl-md bg-[#F4F4F7] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[#2B2B31] whitespace-pre-wrap">
                {m.text}
                {m.engine && <div className="mt-1.5 text-[9.5px] uppercase tracking-wide text-ink-muted">{m.engine === 'llm' ? 'LLM answer' : 'Answered from live data'}</div>}
              </div>
            ) : (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 text-white px-3.5 py-2.5 text-[12.5px] leading-relaxed">{m.text}</div>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-ink-muted px-1">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-[11px]">Reading your inbox…</span>
          </div>
        )}
        {messages.length <= 1 && (
          <div className="pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-muted mb-2 px-1">Try asking</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestionList.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-[11px] px-2.5 h-7 rounded-full border border-hairline bg-white text-ink-secondary hover:text-brand-700 hover:border-brand-300 transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="p-3 border-t border-hairline shrink-0">
        <div className="flex items-end gap-2 rounded-xl border border-hairline bg-[#FCFCFD] focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/15 transition p-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }}
            rows={1}
            placeholder="Ask about your inbox…"
            className="flex-1 resize-none bg-transparent outline-none text-[13px] max-h-32 px-1.5 py-1"
            aria-label="Ask Relay AI"
          />
          <button type="submit" disabled={!input.trim() || busy} className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 transition-colors" aria-label="Send">
            <ArrowUp size={16} />
          </button>
        </div>
        <p className="mt-1.5 text-[9.5px] text-ink-muted px-1">Answers come from your workspace data. AI drafts are never sent without your approval.</p>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop (2xl+): docked panel */}
      <aside className="hidden 2xl:block w-[360px] shrink-0 h-screen sticky top-0 animate-slide-in-right">{body}</aside>
      {/* Smaller screens: overlay drawer */}
      <div className="2xl:hidden fixed inset-0 z-40">
        <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
        <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[400px] shadow-pop animate-slide-in-right">{body}</aside>
      </div>
    </>
  );
}
