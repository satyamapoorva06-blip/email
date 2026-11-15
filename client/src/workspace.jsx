// Which client the assistant is currently looking at ('all' or a client id).
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from './api';
import { useAuth } from './context.jsx';

const WorkspaceContext = createContext(null);
export const useWorkspace = () => useContext(WorkspaceContext);

export function WorkspaceProvider({ children }) {
  const { user } = useAuth();
  const [clientId, setClientId] = useState('all');
  const [clients, setClients] = useState([]);
  const [counts, setCounts] = useState({});

  const refreshClients = useCallback(async () => {
    if (user?.role !== 'assistant') return;
    try {
      const { data } = await api.get('/api/clients');
      setClients(data.clients);
    } catch { /* sidebar shows a skeleton; not fatal */ }
  }, [user?.role]);

  const refreshCounts = useCallback(async () => {
    if (user?.role !== 'assistant') return;
    try {
      const { data } = await api.get('/api/stats', { params: { clientId } });
      setCounts(data);
    } catch { setCounts({}); }
  }, [user?.role, clientId]);

  useEffect(() => { refreshClients(); }, [refreshClients]);
  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  return (
    <WorkspaceContext.Provider value={{ clientId, setClientId, clients, counts, refreshClients, refreshCounts }}>
      {children}
    </WorkspaceContext.Provider>
  );
}
