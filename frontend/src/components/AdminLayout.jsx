import React, { useState, useMemo } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Radio, 
  Users, 
  Settings, 
  LogOut, 
  Tv, 
  Menu, 
  X, 
  QrCode,
  Sparkles,
  Shield,
  User
} from 'lucide-react';
import { MvjLogo, DeveloperCredit } from './Branding';

export default function AdminLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('admin_user')) || null;
    } catch {
      return null;
    }
  }, []);

  const hasPerm = (perm) => {
    if (!currentUser) return true;
    if (currentUser.role === 'super_admin') return true;
    const perms = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    if (perms.includes('*') || perms.includes(perm)) return true;
    if (currentUser.role === 'attendance_manager') {
      const allowed = ['view_dashboard', 'view_live_attendance', 'manage_live_attendance', 'manage_attendance_qr', 'view_students', 'view_reports', 'export_reports'];
      if (allowed.includes(perm)) return true;
    }
    if (currentUser.role === 'qr_manager') {
      const allowed = ['view_dashboard', 'view_registration_qr', 'display_registration_qr', 'manage_attendance_qr'];
      if (allowed.includes(perm)) return true;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/admin');
  };

  const allNavItems = [
    { label: 'Control Center', path: '/admin/dashboard', icon: LayoutDashboard, perm: 'view_dashboard' },
    { label: 'Live Attendance', path: '/admin/attendance', icon: Radio, perm: 'view_live_attendance' },
    { label: 'Student Roster', path: '/admin/students', icon: Users, perm: 'view_students' },
    { label: 'Registration & Settings', path: '/admin/settings', icon: Settings, perm: 'manage_settings' },
  ];

  const navItems = allNavItems.filter(item => {
    if (item.path === '/admin/settings') {
      return hasPerm('manage_settings') || hasPerm('view_registration_qr') || hasPerm('manage_users');
    }
    return hasPerm(item.perm);
  });

  const getRoleLabel = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'attendance_manager': return 'Attendance Mgr';
      case 'qr_manager': return 'QR Manager';
      case 'custom': return 'Staff Access';
      default: return 'Administrator';
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[#080605] text-[#f5f0ea] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="flex md:hidden items-center justify-between border-b border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-4 py-3 safe-top">
        <div className="flex items-center gap-2.5">
          <MvjLogo className="h-7" />
          <span className="font-serif text-lg font-normal text-[#f5f0ea]">
            Spotlight <span className="italic text-amber-400">Admin</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg p-2 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea] active:scale-95"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 shrink-0 border-r border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5 md:min-h-screen flex flex-col justify-between safe-bottom`}
      >
        <div>
          {/* Brand Logo */}
          <div className="hidden md:flex flex-col px-2 py-4 border-b border-[rgba(255,235,215,0.08)] mb-6">
            <div className="mb-3">
              <MvjLogo className="h-9" />
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
              MVJ College of Engineering
            </div>
            <div className="font-serif text-xl font-normal text-[#f5f0ea] mt-0.5">
              Spotlight <span className="italic text-amber-400">Portal</span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 min-h-[44px] rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="mt-8 pt-6 border-t border-[rgba(255,235,215,0.08)] space-y-2">
          {/* Launch Projector Display Screen */}
          <a
            href="/display"
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] items-center justify-between rounded-xl border border-[rgba(240,150,80,0.3)] bg-gradient-to-r from-[#18130e] to-[#14100c] px-3.5 py-2.5 text-xs font-semibold text-amber-400 transition hover:border-amber-500/60"
          >
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4" />
              <span>Launch Projector</span>
            </div>
            <span className="text-[10px] font-mono text-[#a39b94]">↗</span>
          </a>

          {/* User Profile Badge */}
          {currentUser && (
            <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="h-7 w-7 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-amber-400" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-semibold text-[#f5f0ea] truncate">
                    {currentUser.display_name || currentUser.username}
                  </p>
                  <p className="text-[10px] text-[#a39b94] font-mono truncate">
                    @{currentUser.username}
                  </p>
                </div>
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border shrink-0 ${
                currentUser.role === 'super_admin'
                  ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                  : currentUser.role === 'attendance_manager'
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                  : currentUser.role === 'qr_manager'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                {getRoleLabel(currentUser.role)}
              </span>
            </div>
          )}

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-[44px] w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign Out</span>
          </button>

          {/* Sidebar Developer Attribution */}
          <div className="pt-3 border-t border-[rgba(255,235,215,0.06)] flex justify-center">
            <DeveloperCredit className="text-[11px]" />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 flex flex-col justify-between">
        <div>{children}</div>
        <footer className="mt-8 pt-4 border-t border-[rgba(255,235,215,0.06)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#706860]">
          <span>MVJ College of Engineering • Departmental Lecture &amp; Event Attendance Portal</span>
          <DeveloperCredit />
        </footer>
      </main>
    </div>
  );
}
