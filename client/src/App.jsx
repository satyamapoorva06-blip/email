// Routes. Two strictly separated zones: /app (assistant workspace) and /client
// (minimal client surface). Guards live here; layouts do the chrome.
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, ToastProvider, useAuth } from './context.jsx';
import { WorkspaceProvider } from './workspace.jsx';
import AssistantLayout from './layouts/AssistantLayout';
import Logo from './components/Logo';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import RoleSelect from './pages/RoleSelect';
import AssistantConnect from './pages/AssistantConnect';
import Overview from './pages/assistant/Overview';
import EmailsPage from './pages/assistant/EmailsPage';
import EmailDetail from './pages/assistant/EmailDetail';
import Meetings from './pages/assistant/Meetings';
import ConnectedAccounts from './pages/assistant/ConnectedAccounts';
import ClientsRoster from './pages/assistant/ClientsRoster';
import ActivityPage from './pages/assistant/ActivityPage';
import SettingsPage from './pages/assistant/SettingsPage';
import Help from './pages/assistant/Help';
import ClientHome from './pages/client/ClientHome';
import ClientReview from './pages/client/ClientReview';
import ClientAllMail from './pages/client/ClientAllMail';

function Splash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-app gap-4">
      <div className="animate-pulse"><Logo size={40} /></div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">Loading workspace</p>
    </div>
  );
}

// Scroll to top on navigation
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function RequireRole({ role, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.role) return <Navigate to="/onboarding/role" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'assistant' ? '/app' : '/client'} replace />;
  return children;
}

function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/onboarding/role" element={<RequireAuth><RoleSelect /></RequireAuth>} />
          <Route path="/onboarding/connect" element={<RequireAuth><AssistantConnect /></RequireAuth>} />

          {/* Assistant workspace */}
          <Route element={<RequireRole role="assistant"><WorkspaceProvider><AssistantLayout /></WorkspaceProvider></RequireRole>}>
            <Route path="/app" element={<Overview />} />
            <Route path="/app/emails" element={<EmailsPage />} />
            <Route path="/app/email/:id" element={<EmailDetail />} />
            <Route path="/app/meetings" element={<Meetings />} />
            <Route path="/app/accounts" element={<ConnectedAccounts />} />
            <Route path="/app/clients" element={<ClientsRoster />} />
            <Route path="/app/activity" element={<ActivityPage />} />
            <Route path="/app/settings" element={<SettingsPage />} />
            <Route path="/app/help" element={<Help />} />
          </Route>

          {/* Client surface */}
          <Route path="/client" element={<RequireRole role="client"><Outlet /></RequireRole>}>
            <Route index element={<ClientHome />} />
            <Route path="email/:id" element={<ClientReview />} />
            <Route path="all" element={<ClientAllMail />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
