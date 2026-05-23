import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Briefcase,
  TrendingUp,
  Settings,
  LogOut,
  User as UserIcon,
  BookOpen,
  Star,
  Zap,
  MessageSquare,
  Newspaper,
  Sparkles,
  Building2,
  Shield,
  Compass,
  HardDrive,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { InstallPWA } from './InstallPWA';

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  /** tailwind text-* class for the icon accent */
  accent: string;
  roles?: string[];
};

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, accent: 'text-indigo-400' },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase, accent: 'text-emerald-400' },
  { to: '/watchlist', label: 'Watchlist', icon: Star, accent: 'text-amber-400' },
  { to: '/predictions', label: 'Predictions', icon: TrendingUp, accent: 'text-fuchsia-400' },
  { to: '/discovery', label: 'Discovery', icon: Compass, accent: 'text-orange-400' },
  { to: '/playground', label: 'Playground', icon: Sparkles, accent: 'text-violet-400' },
  { to: '/chat', label: 'AI Chat', icon: MessageSquare, accent: 'text-sky-400' },
  { to: '/news', label: 'News', icon: Newspaper, accent: 'text-cyan-400' },
  { to: '/ipo', label: 'IPOs', icon: Building2, accent: 'text-teal-400' },
  { to: '/brokers', label: 'Brokers', icon: Zap, accent: 'text-yellow-400' },
  { to: '/settings', label: 'Settings', icon: Settings, accent: 'text-slate-300' },
  { to: '/admin', label: 'Admin', icon: Shield, accent: 'text-rose-400', roles: ['Admin', 'Super Admin'] },
  { to: '/backups', label: 'Backups', icon: HardDrive, accent: 'text-indigo-400', roles: ['Admin', 'Super Admin'] },
  { to: '/docs', label: 'Docs', icon: BookOpen, accent: 'text-lime-400' },
];

// Bottom-nav: keep the most-used 5 for mobile
const bottomNavKeys = ['/', '/portfolio', '/predictions', '/chat', '/settings'];

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => {
    setDrawerOpen(false);
  }, [loc.pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  if (!user) return null;

  const visible = navItems.filter((i) => !i.roles || i.roles.includes(user.role));
  const bottomNav = visible.filter((i) => bottomNavKeys.includes(i.to));

  const renderSidebar = (showClose: boolean) => (
    <aside className="app-sidebar w-64 h-full flex flex-col p-5 md:p-6">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo.svg"
            alt=""
            aria-hidden
            className="w-10 h-10 rounded-xl shadow-lg shadow-emerald-500/10 ring-1 ring-white/10 shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-2xl font-display font-black tracking-tighter uppercase leading-none bg-gradient-to-r from-white via-indigo-200 to-emerald-200 bg-clip-text text-transparent">
              FinPredict
            </h1>
            <div className="text-[8px] uppercase tracking-[0.4em] opacity-50 mt-1">AI Investment Manager</div>
          </div>
        </div>
        {showClose && (
          <button
            className="md:hidden text-white/70 hover:text-white p-2"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto hide-scrollbar -mx-2 px-2">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 text-[11px] uppercase tracking-widest rounded-lg transition-all ${
                isActive ? 'nav-active font-black' : 'opacity-80 hover:opacity-100'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={15} className={isActive ? 'text-slate-900' : item.accent} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 pt-5 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-fuchsia-500 rounded-full flex items-center justify-center shadow-lg">
            <UserIcon size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold truncate">{user.username}</div>
            <div className="text-[8px] uppercase opacity-60 tracking-widest">{user.role}</div>
          </div>
        </div>
        <button
          onClick={async () => {
            await logout();
            nav('/login');
          }}
          className="w-full flex items-center gap-3 px-3 py-2 text-[11px] uppercase tracking-widest rounded-lg opacity-70 hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-300 transition-all"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <div className="hidden md:flex md:sticky md:top-0 md:h-screen">{renderSidebar(false)}</div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-backdrop md:hidden" onClick={() => setDrawerOpen(false)} aria-hidden />
          <div className="fixed inset-y-0 left-0 z-[60] md:hidden">{renderSidebar(true)}</div>
        </>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-white/85 backdrop-blur border-b border-slate-200">
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 -ml-2 rounded-lg hover:bg-slate-100"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <img src="/logo.svg" alt="" aria-hidden className="w-7 h-7 rounded-lg shrink-0" />
            <div className="font-display font-black tracking-tight uppercase text-base bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-emerald-600 bg-clip-text text-transparent">
              FinPredict
            </div>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center shadow-md">
            <UserIcon size={15} className="text-white" />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 md:p-10 max-w-[1400px] w-full mx-auto pb-24 md:pb-10">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="hidden md:block border-t border-slate-200 bg-slate-50/80 px-6 py-4">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-widest text-slate-400">
              FinPredict-AI v1.5.0 &copy; {new Date().getFullYear()}
            </div>
            <nav className="flex items-center gap-4">
              <NavLink to="/docs?tab=guide" className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">User Guide</NavLink>
              <NavLink to="/docs?tab=requirements" className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">Requirements</NavLink>
              <NavLink to="/docs?tab=readme" className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">README</NavLink>
              <NavLink to="/docs?tab=changelog" className="text-[10px] uppercase tracking-widest text-slate-500 hover:text-indigo-600 transition-colors">Changelog</NavLink>
            </nav>
          </div>
        </footer>

        {/* Mobile bottom nav */}
        <nav className="mobile-bottom-nav md:hidden" aria-label="Primary">
          {bottomNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 flex-1 py-1.5 rounded-lg ${
                  isActive ? 'text-indigo-600' : 'text-slate-500'
                }`
              }
            >
              <item.icon size={18} />
              <span className="text-[9px] uppercase tracking-wider font-semibold">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
      <InstallPWA />
    </div>
  );
}
