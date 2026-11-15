// Assistant workspace shell: sidebar + topbar + routed content + AI panel.
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import AIPanel from '../components/AIPanel';

export default function AssistantLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('relay_ai_open') === '1');
  const toggleAI = () => setAiOpen((v) => { localStorage.setItem('relay_ai_open', v ? '0' : '1'); return !v; });

  return (
    <div className="min-h-screen flex bg-app">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex-1 flex min-w-0 h-screen">
        <div className="flex-1 min-w-0 flex flex-col">
          <TopBar onMenu={() => setMenuOpen(true)} onToggleAI={toggleAI} aiOpen={aiOpen} />
          <main className="flex-1 overflow-y-auto min-w-0">
            <Outlet />
          </main>
        </div>
        {aiOpen && <AIPanel open={aiOpen} onClose={toggleAI} />}
      </div>
    </div>
  );
}
