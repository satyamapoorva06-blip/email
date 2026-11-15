// Auth context + toast context kept together: both are small app-wide stores.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import api from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('relay_user') || 'null'); } catch { return null; } });
  const [ready, setReady] = useState(false);

  // Revalidate the stored session on mount (it may have expired server-side).
  useEffect(() => {
    if (!localStorage.getItem('relay_token')) { setReady(true); return; }
    api.get('/api/auth/me').then(({ data }) => {
      setUser(data.user);
      localStorage.setItem('relay_user', JSON.stringify(data.user));
    }).catch(() => { localStorage.removeItem('relay_token'); localStorage.removeItem('relay_user'); setUser(null); })
      .finally(() => setReady(true));
  }, []);

  const persist = (token, nextUser) => {
    localStorage.setItem('relay_token', token);
    localStorage.setItem('relay_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password });
    persist(data.token, data.user);
    return data.user;
  };
  const register = async (name, email, password) => {
    const { data } = await api.post('/api/auth/register', { name, email, password });
    persist(data.token, data.user);
    return data.user;
  };
  const setRole = async (role) => {
    const { data } = await api.put('/api/auth/role', { role });
    localStorage.setItem('relay_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try { await api.post('/api/auth/logout'); } catch { /* session may already be gone */ }
    localStorage.removeItem('relay_token');
    localStorage.removeItem('relay_user');
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, ready, login, register, logout, setRole }}>{children}</AuthContext.Provider>;
}

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  const icons = { success: <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />, error: <AlertCircle size={16} className="text-red-600 shrink-0" />, info: <Info size={16} className="text-brand-600 shrink-0" /> };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 left-5 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => (
          <div key={t.id} className="animate-fade-up flex items-start gap-2.5 bg-white border border-hairline shadow-pop rounded-xl px-3.5 py-2.5 text-[13px] text-ink">
            {icons[t.type]}
            <span className="leading-snug">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="ml-auto text-ink-muted hover:text-ink" aria-label="Dismiss"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
