import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Bug,
  Receipt,
  BarChart3,
  ShieldCheck,
  Users,
  Briefcase,
  Bell,
  LogOut,
  ChevronDown,
  Sparkles,
  Menu,
  X,
  FileText,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '@deliveryos/shared';
import { api } from '../api/client';

export const InternalLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await api.get<{ notifications: any[]; unreadCount: number }>('/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // ignore
    }
  };

  const handleToggleNotifications = () => {
    if (!showNotifications) {
      fetchNotifications();
    }
    setShowNotifications(!showNotifications);
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    } catch {
      // ignore
    }
  };

  const handleOpenNotification = async (n: any) => {
    try {
      if (!n.readAt) {
        await api.patch(`/notifications/${n.id}/read`);
        setUnreadCount((c) => Math.max(0, c - 1));
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))
        );
      }
    } catch {
      // ignore
    }
    if (n.linkUrl) navigate(n.linkUrl);
    setShowNotifications(false);
  };

  const isRole = (roles: UserRole[]) => user && roles.includes(user.role);

  // BD role is focused on the client-acquisition pipeline — they don't
  // participate in project execution, so we hide unrelated nav items.
  const isBD = user?.role === UserRole.BD;

  const navItems = [
    { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
    // Project execution items — hidden from BD
    ...(!isBD ? [
      { label: 'Projects', path: '/app/projects', icon: FolderKanban },
      ...(isRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QA])
        ? [{ label: 'QA & Bugs', path: '/app/qa', icon: Bug }]
        : []),
    ] : []),
    // CRM / acquisition pipeline — visible to BD + ADMIN + SUPER_ADMIN
    ...(isRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.BD])
      ? [{ label: 'Clients & Leads', path: '/app/leads', icon: Briefcase }]
      : []),
    ...(isRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROJECT_MANAGER])
      ? [
          { label: 'Invoices & Billing', path: '/app/invoices', icon: Receipt },
          { label: 'Reports', path: '/app/reports', icon: BarChart3 },
        ]
      : []),
    ...(isRole([UserRole.SUPER_ADMIN, UserRole.ADMIN])
      ? [
          { label: 'Team', path: '/app/users', icon: Users },
          { label: 'Audit Log', path: '/app/audit', icon: ShieldCheck },
        ]
      : []),
  ];

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white flex flex-col justify-between transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Brand Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-md shadow-brand-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-slate-900 tracking-tight text-base">DeliveryOS</span>
              <span className="block text-[10px] uppercase tracking-wider font-semibold text-brand-600">
                Operating System
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 ${
                      isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-500'
                    }`}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 text-xs font-bold uppercase">
                {user?.profile?.firstName?.[0] || user?.email[0]}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {user?.profile?.displayName || user?.email}
                </p>
                <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-200/80 text-slate-700 capitalize">
                  {user?.role?.replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex-shrink-0 border-b border-slate-200 bg-white px-4 md:px-8 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <h1 className="text-lg font-semibold text-slate-900">
              {navItems.find((i) => location.pathname.startsWith(i.path))?.label || 'DeliveryOS'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={handleToggleNotifications}
                aria-label="Toggle notifications"
                className="relative p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-white shadow-xl border border-slate-200 z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                    <span className="text-xs font-semibold text-slate-800">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Mark all as read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No notifications yet
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => handleOpenNotification(n)}
                          className={`p-3 text-left transition-colors cursor-pointer ${
                            !n.readAt ? 'bg-brand-50/30' : 'hover:bg-slate-50'
                          }`}
                        >
                          <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                          <span className="block text-[10px] text-slate-400 mt-1">
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
