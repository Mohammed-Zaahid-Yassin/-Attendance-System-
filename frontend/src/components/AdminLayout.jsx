import React, { useState } from 'react';
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
  Sparkles
} from 'lucide-react';
import { MvjLogo, DeveloperCredit } from './Branding';

export default function AdminLayout({ children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    navigate('/admin');
  };

  const navItems = [
    { label: 'Control Center', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Live Attendance', path: '/admin/attendance', icon: Radio },
    { label: 'Student Roster', path: '/admin/students', icon: Users },
    { label: 'Registration & Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-[#080605] text-[#f5f0ea] flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="flex md:hidden items-center justify-between border-b border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <MvjLogo className="h-7" />
          <span className="font-serif text-lg font-normal text-[#f5f0ea]">
            Spotlight <span className="italic text-amber-400">Admin</span>
          </span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-lg p-2 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } md:block w-full md:w-64 shrink-0 border-r border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-5 md:min-h-screen flex flex-col justify-between`}
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
                    `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : 'text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
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
            className="flex items-center justify-between rounded-xl border border-[rgba(240,150,80,0.3)] bg-gradient-to-r from-[#18130e] to-[#14100c] px-3.5 py-2.5 text-xs font-semibold text-amber-400 transition hover:border-amber-500/60"
          >
            <div className="flex items-center gap-2">
              <Tv className="h-4 w-4" />
              <span>Launch Projector</span>
            </div>
            <span className="text-[10px] font-mono text-[#a39b94]">↗</span>
          </a>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition"
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
