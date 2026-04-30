import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { AppShell } from './components/AppShell';
import { LoginPage, RegisterPage } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { PortfolioPage } from './pages/Portfolio';
import { WatchlistPage } from './pages/Watchlist';
import { PredictionsPage } from './pages/Predictions';
import { PlaygroundPage } from './pages/Playground';
import { ChatPage } from './pages/Chat';
import { NewsPage } from './pages/News';
import { IPOPage } from './pages/IPO';
import { DiscoveryPage } from './pages/Discovery';
import { BrokersPage } from './pages/Brokers';
import { SettingsPage } from './pages/Settings';
import { AdminPage } from './pages/Admin';
import { DocsPage } from './pages/Docs';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 opacity-50 text-sm">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'Admin' && user.role !== 'Super Admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-10 opacity-50 text-sm">Loading…</div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
            <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
            <Route element={<Protected><AppShell /></Protected>}>
              <Route index element={<DashboardPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/predictions" element={<PredictionsPage />} />
              <Route path="/playground" element={<PlaygroundPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/ipo" element={<IPOPage />} />
              <Route path="/discovery" element={<DiscoveryPage />} />
              <Route path="/brokers" element={<BrokersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminOnly><AdminPage /></AdminOnly>} />
              <Route path="/docs" element={<DocsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
