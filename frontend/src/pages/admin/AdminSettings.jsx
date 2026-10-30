import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import VenueMapPicker from '../../components/VenueMapPicker';
import { QrNicOverlay } from '../../components/Branding';
import {
  QrCode,
  Download,
  Copy,
  Check,
  Printer,
  Lock,
  Save,
  Navigation,
  RotateCcw,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Eye,
  Pencil,
  X,
  BookmarkCheck,
  Star,
  CornerDownLeft,
  RefreshCw,
  Maximize2,
  UserPlus,
  Users,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  Shield
} from 'lucide-react';
import FullscreenRegistrationModal from '../../components/FullscreenRegistrationModal';

const MVJCE_DEFAULT = {
  lat: 12.985300,
  lng: 77.762465,
  radius: 100,
  name: 'MVJCE Central Auditorium'
};

// Clipboard helper with fallback
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-999999px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok;
}

// 2D Line Segment Intersection Helper for Polygon Self-Intersection Test
function doSegmentsIntersect(p1, p2, p3, p4) {
  const ccw = (a, b, c) => (c.lng - a.lng) * (b.lat - a.lat) > (b.lng - a.lng) * (c.lat - a.lat);
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

function checkPolygonSelfIntersection(pts) {
  if (!Array.isArray(pts) || pts.length < 4) return false;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      if (doSegmentsIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

/* ─── User Management Constants & Modals ─────────────────────────────────── */
const AVAILABLE_PERMISSIONS = [
  { id: 'view_dashboard', label: 'View Dashboard & Stats', desc: 'Can view overview stats and metrics' },
  { id: 'view_registration_qr', label: 'View Registration QR', desc: 'Can view static student registration QR card' },
  { id: 'display_registration_qr', label: 'Display Fullscreen QR', desc: 'Can display fullscreen registration QR for auditoriums' },
  { id: 'manage_attendance_qr', label: 'Manage Attendance QR', desc: 'Can freeze / resume dynamic session QR code tokens' },
  { id: 'view_live_attendance', label: 'View Live Attendance', desc: 'Can view live incoming attendance streams' },
  { id: 'manage_live_attendance', label: 'Manage Live Attendance', desc: 'Can start/stop sessions, manual mark & toggle geofences' },
  { id: 'view_students', label: 'View Student Roster', desc: 'Can view, filter and search registered students' },
  { id: 'manage_students', label: 'Manage Student Roster', desc: 'Can edit details and remove student roster entries' },
  { id: 'view_reports', label: 'View Reports', desc: 'Can view attendance summaries and analytics' },
  { id: 'export_reports', label: 'Export Reports', desc: 'Can download session attendance CSV and Excel XLSX files' },
  { id: 'manage_settings', label: 'Manage App Settings', desc: 'Can configure venue coordinates, polygons and presets' },
  { id: 'manage_users', label: 'Manage User Accounts', desc: 'Can create, edit, deactivate and delete admin accounts' }
];

const ROLE_PRESET_PERMS = {
  super_admin: ['*'],
  attendance_manager: ['view_dashboard', 'view_live_attendance', 'manage_live_attendance', 'manage_attendance_qr', 'view_students', 'view_reports', 'export_reports'],
  qr_manager: ['view_dashboard', 'view_registration_qr', 'display_registration_qr', 'manage_attendance_qr'],
  custom: ['view_dashboard']
};

function AddUserModal({ onSave, onClose }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('super_admin');
  const [permissions, setPermissions] = useState(ROLE_PRESET_PERMS.super_admin);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole !== 'custom') {
      setPermissions(ROLE_PRESET_PERMS[newRole] || ['view_dashboard']);
    }
  };

  const togglePermission = (permId) => {
    if (permissions.includes('*')) {
      const allPermIds = AVAILABLE_PERMISSIONS.map(p => p.id);
      setPermissions(allPermIds.filter(id => id !== permId));
      setRole('custom');
      return;
    }
    if (permissions.includes(permId)) {
      setPermissions(permissions.filter(p => p !== permId));
    } else {
      setPermissions([...permissions, permId]);
    }
    setRole('custom');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim()) { setError('Username is required'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters long'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setSaving(true);
    try {
      await onSave({
        username: username.trim(),
        display_name: displayName.trim() || username.trim(),
        password,
        confirm_password: confirmPassword,
        role,
        permissions: role === 'super_admin' ? ['*'] : permissions
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-[rgba(255,235,215,0.12)] bg-[#120f0d] p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <UserPlus className="h-5 w-5" />
            <h3 className="font-serif text-lg text-[#f5f0ea]">Add New Administrative User</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Username <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. jsharma"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Dr. Jagdish Sharma"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
              Role Assignment <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'super_admin', label: 'Super Admin', desc: 'Full system privileges' },
                { id: 'attendance_manager', label: 'Attendance Mgr', desc: 'Live & manual attendance' },
                { id: 'qr_manager', label: 'QR Manager', desc: 'Registration & display QR' },
                { id: 'custom', label: 'Custom', desc: 'Granular checkbox selection' }
              ].map(r => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => handleRoleChange(r.id)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition ${
                    role === r.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold shadow-sm'
                      : 'border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] hover:border-amber-500/40'
                  }`}
                >
                  <span className="font-medium text-[#f5f0ea]">{r.label}</span>
                  <span className="text-[10px] text-[#706860] mt-0.5 leading-tight">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                Granular Permissions ({role === 'super_admin' ? 'All System Access Granted' : `${permissions.length} Enabled`})
              </span>
              {role !== 'super_admin' && (
                <span className="text-[10px] text-amber-400/80">Select any to customize</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
              {AVAILABLE_PERMISSIONS.map(p => {
                const isChecked = permissions.includes('*') || permissions.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer select-none transition ${
                      isChecked
                        ? 'border-amber-500/40 bg-amber-500/10 text-[#f5f0ea]'
                        : 'border-[rgba(255,235,215,0.05)] bg-[#14100c] text-[#706860] hover:text-[#a39b94]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => togglePermission(p.id)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[rgba(255,235,215,0.2)] bg-[#181512] text-amber-500 focus:ring-0 focus:outline-none"
                    />
                    <div>
                      <p className="font-medium leading-none text-[11px] text-[#f5f0ea]">{p.label}</p>
                      <p className="text-[9px] text-[#a39b94] mt-0.5 leading-tight">{p.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Password (min 6 chars) <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Confirm Password <span className="text-red-400">*</span>
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgba(255,235,215,0.08)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-4 py-2 text-xs font-semibold text-[#f5f0ea] hover:border-amber-500 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-semibold text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create User Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onSave, onClose }) {
  const isPrimaryAdmin = user.id === 1 || user.username === 'admin';
  const [displayName, setDisplayName] = useState(user.display_name || user.username || '');
  const [role, setRole] = useState(user.role || 'super_admin');
  const [isActive, setIsActive] = useState(Boolean(user.is_active));
  const initialPerms = Array.isArray(user.permissions) ? user.permissions : (ROLE_PRESET_PERMS[user.role] || ['view_dashboard']);
  const [permissions, setPermissions] = useState(initialPerms);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleRoleChange = (newRole) => {
    if (isPrimaryAdmin) return;
    setRole(newRole);
    if (newRole !== 'custom') {
      setPermissions(ROLE_PRESET_PERMS[newRole] || ['view_dashboard']);
    }
  };

  const togglePermission = (permId) => {
    if (isPrimaryAdmin) return;
    if (permissions.includes('*')) {
      const allPermIds = AVAILABLE_PERMISSIONS.map(p => p.id);
      setPermissions(allPermIds.filter(id => id !== permId));
      setRole('custom');
      return;
    }
    if (permissions.includes(permId)) {
      setPermissions(permissions.filter(p => p !== permId));
    } else {
      setPermissions([...permissions, permId]);
    }
    setRole('custom');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password) {
      if (password.length < 6) { setError('New password must be at least 6 characters long'); return; }
      if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    }

    setSaving(true);
    try {
      const payload = {
        display_name: displayName.trim(),
        role: isPrimaryAdmin ? 'super_admin' : role,
        is_active: isPrimaryAdmin ? 1 : (isActive ? 1 : 0),
        permissions: (isPrimaryAdmin || role === 'super_admin') ? ['*'] : permissions
      };
      if (password) {
        payload.password = password;
        payload.confirm_password = confirmPassword;
      }
      await onSave(user.id, payload);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-[rgba(255,235,215,0.12)] bg-[#120f0d] p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
          <div className="flex items-center gap-2 text-amber-400">
            <Pencil className="h-5 w-5" />
            <div>
              <h3 className="font-serif text-lg text-[#f5f0ea]">Edit Account Details</h3>
              <p className="text-[11px] font-mono text-[#a39b94]">@{user.username}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        {isPrimaryAdmin && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center gap-2">
            <Shield className="h-4 w-4 shrink-0 text-amber-400" />
            <span>Primary Administrator account is protected. Super admin role and active status cannot be demoted or deactivated.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Account Status
              </label>
              <button
                type="button"
                disabled={isPrimaryAdmin}
                onClick={() => setIsActive(!isActive)}
                className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                  isPrimaryAdmin 
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 opacity-80 cursor-not-allowed'
                    : isActive
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20'
                    : 'border-red-500/40 bg-red-500/15 text-red-400 hover:bg-red-500/20'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {isActive ? <UserCheck className="h-4 w-4" /> : <UserX className="h-4 w-4" />}
                  {isActive ? 'Active (Permitted to Log In)' : 'Deactivated (Access Revoked)'}
                </span>
                <span className="text-[10px] uppercase font-mono">{isPrimaryAdmin ? 'LOCKED' : 'TOGGLE'}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
              Role Assignment
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'super_admin', label: 'Super Admin', desc: 'Full system privileges' },
                { id: 'attendance_manager', label: 'Attendance Mgr', desc: 'Live & manual attendance' },
                { id: 'qr_manager', label: 'QR Manager', desc: 'Registration & display QR' },
                { id: 'custom', label: 'Custom', desc: 'Granular checkbox selection' }
              ].map(r => (
                <button
                  type="button"
                  key={r.id}
                  disabled={isPrimaryAdmin}
                  onClick={() => handleRoleChange(r.id)}
                  className={`flex flex-col text-left p-2.5 rounded-xl border text-xs transition ${
                    isPrimaryAdmin && r.id !== 'super_admin'
                      ? 'opacity-30 cursor-not-allowed border-[rgba(255,235,215,0.05)] bg-[#14100c]'
                      : role === r.id
                      ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold shadow-sm'
                      : 'border-[rgba(255,235,215,0.08)] bg-[#181512] text-[#a39b94] hover:border-amber-500/40'
                  }`}
                >
                  <span className="font-medium text-[#f5f0ea]">{r.label}</span>
                  <span className="text-[10px] text-[#706860] mt-0.5 leading-tight">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Granular Permissions Section */}
          <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                Granular Permissions ({role === 'super_admin' ? 'All System Access Granted' : `${permissions.length} Enabled`})
              </span>
              {role !== 'super_admin' && !isPrimaryAdmin && (
                <span className="text-[10px] text-amber-400/80">Select any to customize</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-48 overflow-y-auto pr-1">
              {AVAILABLE_PERMISSIONS.map(p => {
                const isChecked = permissions.includes('*') || permissions.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className={`flex items-start gap-2 p-2 rounded-lg border text-xs select-none transition ${
                      isPrimaryAdmin
                        ? 'opacity-70 cursor-not-allowed border-amber-500/20 bg-amber-500/5 text-[#f5f0ea]'
                        : isChecked
                        ? 'cursor-pointer border-amber-500/40 bg-amber-500/10 text-[#f5f0ea]'
                        : 'cursor-pointer border-[rgba(255,235,215,0.05)] bg-[#14100c] text-[#706860] hover:text-[#a39b94]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={isPrimaryAdmin}
                      checked={isChecked}
                      onChange={() => togglePermission(p.id)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-[rgba(255,235,215,0.2)] bg-[#181512] text-amber-500 focus:ring-0 focus:outline-none"
                    />
                    <div>
                      <p className="font-medium leading-none text-[11px] text-[#f5f0ea]">{p.label}</p>
                      <p className="text-[9px] text-[#a39b94] mt-0.5 leading-tight">{p.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Reset Password */}
          <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3.5 space-y-3">
            <div className="flex items-center gap-2 text-amber-400">
              <KeyRound className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Reset Password (Optional — Leave Blank to Keep Existing)
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty to keep current"
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#120f0d] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#120f0d] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[rgba(255,235,215,0.08)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-4 py-2 text-xs font-semibold text-[#f5f0ea] hover:border-amber-500 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-2 text-xs font-semibold text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Saved Location Modal ─────────────────────────────────────────────────── */
function SavedLocationModal({ location, onSave, onClose }) {
  const isNew = !location?.id;
  const [name, setName] = useState(location?.name || '');
  const [description, setDescription] = useState(location?.description || '');
  const [type, setType] = useState(location?.type || 'circle');
  const [lat, setLat] = useState(location?.geo_lat ?? MVJCE_DEFAULT.lat);
  const [lng, setLng] = useState(location?.geo_lng ?? MVJCE_DEFAULT.lng);
  const [radius, setRadius] = useState(location?.geo_radius_m ?? 100);

  const initialCorners = location?.geo_corners
    ? (typeof location.geo_corners === 'string' ? JSON.parse(location.geo_corners) : location.geo_corners)
    : [];

  const [corners, setCorners] = useState(Array.isArray(initialCorners) ? initialCorners : []);
  const [targetEdges, setTargetEdges] = useState(
    Array.isArray(initialCorners) && initialCorners.length >= 4 ? initialCorners.length : 4
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  const handleGPS = () => {
    if (!('geolocation' in navigator)) { setError('GPS not supported'); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setGpsLoading(false);
      },
      (err) => { setError('GPS error: ' + err.message); setGpsLoading(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleEdgesChange = (newCount) => {
    const val = parseInt(newCount, 10);
    if (isNaN(val) || val < 4 || val > 20) return;
    if (corners.length > val) {
      if (window.confirm(`Reducing to ${val} edges will trim existing points from the end. Continue?`)) {
        setCorners(corners.slice(0, val));
      } else {
        return;
      }
    }
    setTargetEdges(val);
  };

  const handleUndoPoint = () => {
    if (corners.length > 0) {
      setCorners(corners.slice(0, -1));
    }
  };

  const handleClearPolygon = () => {
    setCorners([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Preset name is required'); return; }

    if (type === 'circle') {
      if (isNaN(lat) || isNaN(lng)) { setError('Valid center coordinates required'); return; }
    } else {
      if (corners.length !== targetEdges) {
        setError(`Please place all ${targetEdges} vertices on the map (currently placed: ${corners.length})`);
        return;
      }
      if (checkPolygonSelfIntersection(corners)) {
        setError('Polygon has self-intersecting boundary edges. Please reposition vertex markers.');
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        id: location?.id,
        name: name.trim(),
        description: description.trim(),
        type,
        geo_lat: type === 'circle' ? lat : (corners[0]?.lat || lat),
        geo_lng: type === 'circle' ? lng : (corners[0]?.lng || lng),
        geo_radius_m: type === 'circle' ? radius : 100,
        geo_corners: type === 'polygon' ? corners : null
      });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save preset');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 backdrop-blur-sm safe-top safe-bottom overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-5 sm:p-6 shadow-2xl overflow-y-auto max-h-[92dvh]">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-serif text-xl text-[#f5f0ea]">
            {isNew ? 'New Location Preset' : 'Edit Preset'}
          </h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#181512]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Preset Name *</label>
            <input
              type="text" required value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CSE Seminar Hall 2B"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-sm text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Description (optional)</label>
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Ground floor, capacity 120"
              className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Geofence Type Selector */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-2">Geofence Type</label>
            <div className="flex gap-2">
              {['circle', 'polygon'].map((t) => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`flex-1 rounded-xl py-2 text-xs font-semibold uppercase tracking-wider transition ${
                    type === t ? 'bg-amber-500 text-[#080605]' : 'border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                >
                  {t === 'circle' ? '⬤ Circle' : '⬡ Polygon'}
                </button>
              ))}
            </div>
          </div>

          {/* Polygon edge count selector */}
          {type === 'polygon' && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                  Number of polygon edges / vertices (4 – 20)
                </label>
                <select
                  value={targetEdges}
                  onChange={(e) => handleEdgesChange(e.target.value)}
                  className="rounded-lg border border-amber-500/30 bg-[#181512] px-3 py-1 font-mono text-xs text-amber-400 font-bold focus:outline-none"
                >
                  {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => (
                    <option key={n} value={n}>
                      {n} Edges ({n} Vertices)
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between text-xs text-[#a39b94]">
                <span>
                  Placed: <strong className="text-amber-400 font-mono">{corners.length}</strong> / {targetEdges}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleUndoPoint}
                    disabled={corners.length === 0}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-[#a39b94] hover:text-amber-400 disabled:opacity-40"
                  >
                    <CornerDownLeft className="h-3 w-3" /> Undo
                  </button>
                  <button
                    type="button"
                    onClick={handleClearPolygon}
                    disabled={corners.length === 0}
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-400 hover:text-red-300 disabled:opacity-40"
                  >
                    <RefreshCw className="h-3 w-3" /> Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Map */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
              {type === 'circle' ? 'Location on Map' : 'Click Map to Place Vertices'}
            </label>
            <VenueMapPicker
              lat={lat}
              lng={lng}
              radius={radius}
              mode={type}
              targetEdges={targetEdges}
              corners={corners}
              onLocationChange={({ lat: newLat, lng: newLng }) => { setLat(newLat); setLng(newLng); }}
              onRadiusChange={(r) => setRadius(r)}
              onCornersChange={(pts) => setCorners(pts)}
              height="260px"
            />
          </div>

          {/* Circle Mode Coordinates and Radius Controls */}
          {type === 'circle' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Latitude</label>
                  <input type="number" step="0.000001" value={lat} onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Longitude</label>
                  <input type="number" step="0.000001" value={lng} onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Radius (m)</label>
                  <input type="number" min={20} max={500} value={radius} onChange={(e) => setRadius(parseInt(e.target.value, 10) || 100)}
                    className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              <button type="button" onClick={handleGPS} disabled={gpsLoading}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500 disabled:opacity-50"
              >
                <Navigation className="h-3.5 w-3.5" />
                <span>{gpsLoading ? 'Acquiring GPS…' : 'Use My Current Location'}</span>
              </button>
            </>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2.5 text-xs font-semibold text-[#a39b94] hover:text-[#f5f0ea]"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] disabled:opacity-50"
            >
              {saving ? 'Saving…' : (isNew ? 'Create Preset' : 'Save Changes')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Main Settings Page ────────────────────────────────────────────────────── */
export default function AdminSettings() {
  const [regData, setRegData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Active venue config state
  const [venueName, setVenueName] = useState(MVJCE_DEFAULT.name);
  const [geoLat, setGeoLat] = useState(MVJCE_DEFAULT.lat);
  const [geoLng, setGeoLng] = useState(MVJCE_DEFAULT.lng);
  const [geoRadius, setGeoRadius] = useState(MVJCE_DEFAULT.radius);
  const [geoType, setGeoType] = useState('circle');
  const [polygonEdges, setPolygonEdges] = useState(4);
  const [polygonPoints, setPolygonPoints] = useState([]);
  const [mapplsKey, setMapplsKey] = useState('');
  const [venueLoading, setVenueLoading] = useState(true);
  const [venueSaving, setVenueSaving] = useState(false);
  const [venueMsg, setVenueMsg] = useState('');
  const [venueError, setVenueError] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  // Saved Locations state
  const [savedLocations, setSavedLocations] = useState([]);
  const [locsLoading, setLocsLoading] = useState(true);
  const [editingLocation, setEditingLocation] = useState(null);
  const [previewLocation, setPreviewLocation] = useState(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loadingPass, setLoadingPass] = useState(false);

  // User Management state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userMsg, setUserMsg] = useState('');
  const [userError, setUserError] = useState('');
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showFullscreenReg, setShowFullscreenReg] = useState(false);

  const getAuthHeaders = () => {
    const currentToken = localStorage.getItem('admin_token') || localStorage.getItem('token') || '';
    return currentToken ? { Authorization: `Bearer ${currentToken}` } : {};
  };
  const axiosConfig = {
    get headers() {
      return getAuthHeaders();
    }
  };

  // ── Initial data load ──────────────────────────────────────────────────
  const loadVenueConfig = useCallback(() => {
    axios.get('/api/admin/venue-config', axiosConfig)
      .then((res) => {
        if (res.data?.config) {
          const c = res.data.config;
          setVenueName(c.venue_name || MVJCE_DEFAULT.name);
          setGeoLat(c.geo_lat || MVJCE_DEFAULT.lat);
          setGeoLng(c.geo_lng || MVJCE_DEFAULT.lng);
          setGeoRadius(c.geo_radius_m || MVJCE_DEFAULT.radius);
          setGeoType(c.geo_type || 'circle');
          setMapplsKey(c.mappls_api_key || '');

          if (c.geo_corners) {
            try {
              const parsed = typeof c.geo_corners === 'string' ? JSON.parse(c.geo_corners) : c.geo_corners;
              if (Array.isArray(parsed) && parsed.length > 0) {
                setPolygonPoints(parsed);
                if (parsed.length >= 4) setPolygonEdges(parsed.length);
              }
            } catch {}
          }
        }
      })
      .catch(() => {})
      .finally(() => setVenueLoading(false));
  }, []);

  const loadSavedLocations = useCallback(() => {
    setLocsLoading(true);
    axios.get('/api/admin/saved-locations', axiosConfig)
      .then((res) => setSavedLocations(res.data?.locations || []))
      .catch(() => {})
      .finally(() => setLocsLoading(false));
  }, []);

  const loadRegistrationQr = useCallback(() => {
    const originParam = encodeURIComponent(window.location.origin);
    axios.get(`/api/admin/registration-qr?origin=${originParam}`, axiosConfig)
      .then((res) => {
        if (res.data) setRegData(res.data);
      })
      .catch((err) => {
        console.error('Failed to load registration QR code:', err);
      });
  }, []);

  const loadUsers = useCallback(() => {
    setLoadingUsers(true);
    axios.get('/api/admin/users', axiosConfig)
      .then((res) => {
        if (res.data && Array.isArray(res.data.users)) {
          setUsers(res.data.users);
        } else {
          setUsers([]);
        }
        setUserError('');
      })
      .catch((err) => {
        if (err.response?.status !== 403) {
          console.error('Failed to load users:', err);
        }
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  const handleCreateUser = async (newUserData) => {
    setUserMsg('');
    setUserError('');
    try {
      const res = await axios.post('/api/admin/users', newUserData, axiosConfig);
      setUserMsg(res.data?.message || 'User created successfully');
      loadUsers();
      setTimeout(() => setUserMsg(''), 4000);
      return res.data;
    } catch (err) {
      const errorMsg = err.response?.data?.error 
        || (typeof err.response?.data === 'string' ? err.response.data : null)
        || err.message 
        || 'Failed to create user';
      setUserError(errorMsg);
      throw err;
    }
  };

  const handleUpdateUser = async (userId, updateData) => {
    setUserMsg('');
    setUserError('');
    const res = await axios.put(`/api/admin/users/${userId}`, updateData, axiosConfig);
    setUserMsg(res.data?.message || 'User updated successfully');
    loadUsers();
    setTimeout(() => setUserMsg(''), 4000);
  };

  const handleToggleUserActive = async (user) => {
    if (user.id === 1 || user.username === 'admin') {
      alert('The primary administrator account cannot be deactivated.');
      return;
    }
    const newActive = !user.is_active;
    const actionText = newActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${actionText} user "${user.username}"?`)) {
      return;
    }
    try {
      setUserMsg('');
      setUserError('');
      const res = await axios.put(`/api/admin/users/${user.id}`, { is_active: newActive ? 1 : 0 }, axiosConfig);
      setUserMsg(res.data?.message || `User ${user.username} ${actionText}d`);
      loadUsers();
      setTimeout(() => setUserMsg(''), 4000);
    } catch (err) {
      setUserError(err.response?.data?.error || err.message || `Failed to ${actionText} user`);
      setTimeout(() => setUserError(''), 5000);
    }
  };

  const handleDeleteUser = async (user) => {
    if (user.id === 1 || user.username === 'admin') {
      alert('The primary administrator account cannot be deleted.');
      return;
    }
    if (!window.confirm(`Are you sure you want to permanently delete user account "${user.username}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setUserMsg('');
      setUserError('');
      const res = await axios.delete(`/api/admin/users/${user.id}`, axiosConfig);
      setUserMsg(res.data?.message || `User ${user.username} deleted`);
      loadUsers();
      setTimeout(() => setUserMsg(''), 4000);
    } catch (err) {
      setUserError(err.response?.data?.error || err.message || 'Failed to delete user');
      setTimeout(() => setUserError(''), 5000);
    }
  };

  useEffect(() => {
    loadRegistrationQr();
    loadVenueConfig();
    loadSavedLocations();
    loadUsers();
  }, [loadRegistrationQr, loadVenueConfig, loadSavedLocations, loadUsers]);

  // ── Mode Switcher ──────────────────────────────────────────────────────
  const handleSwitchMode = (newMode) => {
    setGeoType(newMode);
    setIsDirty(true);
    setVenueMsg('');
    setVenueError('');
  };

  const handlePolygonEdgesChange = (val) => {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 4 || num > 20) return;
    if (polygonPoints.length > num) {
      if (window.confirm(`Reducing edges to ${num} will remove the last ${polygonPoints.length - num} points. Proceed?`)) {
        setPolygonPoints(polygonPoints.slice(0, num));
      } else {
        return;
      }
    }
    setPolygonEdges(num);
    setIsDirty(true);
  };

  const handleUndoPolygonPoint = () => {
    if (polygonPoints.length > 0) {
      setPolygonPoints((prev) => prev.slice(0, -1));
      setIsDirty(true);
    }
  };

  const handleClearPolygonPoints = () => {
    setPolygonPoints([]);
    setIsDirty(true);
  };

  // ── Venue config handlers ──────────────────────────────────────────────
  const handleSaveVenue = async (e) => {
    e.preventDefault();
    setVenueSaving(true);
    setVenueMsg('');
    setVenueError('');

    if (geoType === 'polygon') {
      if (polygonPoints.length !== polygonEdges) {
        setVenueError(`Please place all ${polygonEdges} vertices on the map before saving (currently placed: ${polygonPoints.length})`);
        setVenueSaving(false);
        return;
      }
      if (checkPolygonSelfIntersection(polygonPoints)) {
        setVenueError('The polygon boundary is self-intersecting. Please drag the markers to form a clean perimeter.');
        setVenueSaving(false);
        return;
      }
    }

    try {
      const res = await axios.post('/api/admin/venue-config', {
        venue_name: venueName,
        geo_lat: geoType === 'circle' ? geoLat : (polygonPoints[0]?.lat || geoLat),
        geo_lng: geoType === 'circle' ? geoLng : (polygonPoints[0]?.lng || geoLng),
        geo_radius_m: geoType === 'circle' ? geoRadius : 100,
        geo_type: geoType,
        geo_corners: geoType === 'polygon' ? polygonPoints : null,
        mappls_api_key: mapplsKey
      }, axiosConfig);
      setVenueMsg(res.data.message || 'Venue configuration saved successfully');
      setIsDirty(false);
    } catch (err) {
      setVenueError(err.response?.data?.error || 'Failed to save venue configuration');
    } finally {
      setVenueSaving(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!('geolocation' in navigator)) { setVenueError('Geolocation not supported'); return; }
    setVenueMsg('');
    setVenueError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLat(parseFloat(pos.coords.latitude.toFixed(6)));
        setGeoLng(parseFloat(pos.coords.longitude.toFixed(6)));
        setVenueMsg('Updated center to current GPS coordinates');
        setIsDirty(true);
      },
      (err) => setVenueError('Could not acquire location: ' + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleResetDefaults = () => {
    setGeoLat(MVJCE_DEFAULT.lat);
    setGeoLng(MVJCE_DEFAULT.lng);
    setGeoRadius(MVJCE_DEFAULT.radius);
    setVenueName(MVJCE_DEFAULT.name);
    setGeoType('circle');
    setPolygonPoints([]);
    setPolygonEdges(4);
    setVenueMsg('Reset to MVJCE campus circle defaults (unsaved)');
    setIsDirty(true);
  };

  // ── Apply preset to active venue config with confirmation ─────────────
  const applyPresetToVenue = (loc) => {
    const typeLabel = loc.type === 'polygon' ? 'Polygon' : 'Circle';
    if (!window.confirm(`Apply preset "${loc.name}" (${typeLabel}) as the active venue geofence?`)) {
      return;
    }

    setVenueName(loc.name);
    setGeoType(loc.type || 'circle');

    if (loc.type === 'polygon') {
      let parsedCorners = [];
      try {
        parsedCorners = typeof loc.geo_corners === 'string' ? JSON.parse(loc.geo_corners) : (loc.geo_corners || []);
      } catch {}
      setPolygonPoints(parsedCorners);
      setPolygonEdges(parsedCorners.length >= 4 ? parsedCorners.length : 4);
    } else {
      setGeoLat(loc.geo_lat || MVJCE_DEFAULT.lat);
      setGeoLng(loc.geo_lng || MVJCE_DEFAULT.lng);
      setGeoRadius(loc.geo_radius_m || 100);
    }

    setVenueMsg(`Loaded preset "${loc.name}" into active venue — click "Save Venue Configuration" to persist.`);
    setIsDirty(true);
    setPreviewLocation(null);
  };

  // ── Saved location CRUD ────────────────────────────────────────────────
  const handleSaveLocation = async (data) => {
    if (data.id) {
      await axios.put(`/api/admin/saved-locations/${data.id}`, data, axiosConfig);
    } else {
      await axios.post('/api/admin/saved-locations', data, axiosConfig);
    }
    await loadSavedLocations();
    setEditingLocation(null);
  };

  const handleDeleteLocation = async (id, name) => {
    if (!window.confirm(`Delete preset "${name}"?`)) return;
    try {
      await axios.delete(`/api/admin/saved-locations/${id}`, axiosConfig);
      if (previewLocation?.id === id) setPreviewLocation(null);
      loadSavedLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete preset');
    }
  };

  // ── Password handler ──────────────────────────────────────────────────
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match'); return; }
    if (newPassword.length < 6) { setPasswordError('Password must be at least 6 characters'); return; }
    setLoadingPass(true);
    try {
      await axios.post('/api/admin/change-password', {
        current_password: currentPassword, new_password: newPassword
      }, axiosConfig);
      setPasswordMsg('Admin password updated successfully');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoadingPass(false);
    }
  };

  // Guaranteed fallback registration link so Copy button always has a valid destination
  const effectiveRegUrl = regData?.url || (typeof window !== 'undefined' ? `${window.location.origin}/register?key=STATIC_REG_QR_KEY_SECRET_7890` : 'https://attendance-system-mvjce.vercel.app/register?key=STATIC_REG_QR_KEY_SECRET_7890');
  const displayQrSrc = regData?.qr_code || `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(effectiveRegUrl)}`;

  const handleCopyLink = async () => {
    if (!effectiveRegUrl) return;
    const ok = await copyToClipboard(effectiveRegUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">MVJ College of Engineering</span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">System Administration</span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Settings & <span className="italic text-amber-400">Venue Configuration.</span>
            </h1>
          </div>
        </div>

        {/* ── SECTION 1: Active Venue Geofence ───────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <MapPin className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Active Venue Geofence</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Venue Configuration</h2>
              {isDirty && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400">
                  ● Unsaved changes
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {geoType === 'circle' && (
                <button type="button" onClick={handleUseCurrentLocation}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-amber-400 hover:border-amber-500 transition"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  <span>Use GPS</span>
                </button>
              )}
              <button type="button" onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.1)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#a39b94] hover:text-[#f5f0ea] transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>MVJCE Default</span>
              </button>
            </div>
          </div>

          {venueMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />{venueMsg}
            </div>
          )}
          {venueError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />{venueError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Interactive Map */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94]">
                  {geoType === 'circle' ? 'Interactive Circular Geofence' : `Interactive Polygon Boundary (${polygonPoints.length} of ${polygonEdges} points placed)`}
                </label>
                {geoType === 'polygon' && polygonPoints.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleUndoPolygonPoint}
                      className="inline-flex items-center gap-1 text-[11px] text-[#a39b94] hover:text-amber-400"
                    >
                      <CornerDownLeft className="h-3 w-3" /> Undo Point
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPolygonPoints}
                      className="inline-flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300"
                    >
                      <RefreshCw className="h-3 w-3" /> Clear
                    </button>
                  </div>
                )}
              </div>

              <VenueMapPicker
                lat={geoLat}
                lng={geoLng}
                radius={geoRadius}
                mode={geoType}
                targetEdges={polygonEdges}
                corners={polygonPoints}
                onLocationChange={({ lat, lng }) => { setGeoLat(lat); setGeoLng(lng); setIsDirty(true); }}
                onRadiusChange={(r) => { setGeoRadius(r); setIsDirty(true); }}
                onCornersChange={(pts) => { setPolygonPoints(pts); setIsDirty(true); }}
                height="380px"
              />

              {geoType === 'circle' ? (
                <p className="text-[11px] text-[#706860]">
                  Click map or drag the center pin to set venue center. Use the radius slider on the right to set boundary distance.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    {polygonPoints.length < polygonEdges
                      ? `Click on the map to place vertex ${polygonPoints.length + 1} of ${polygonEdges}. Numbered markers will connect in sequence.`
                      : `✓ All ${polygonEdges} vertices placed! Drag any numbered marker on the map to adjust edges.`}
                  </p>
                  {polygonPoints.length >= 4 && checkPolygonSelfIntersection(polygonPoints) && (
                    <p className="text-[11px] text-red-400 font-semibold flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Warning: Boundary edges self-intersect. Reposition markers to make a clean polygon.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSaveVenue} className="lg:col-span-5 space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Venue Name</label>
                <input type="text" required value={venueName}
                  onChange={(e) => { setVenueName(e.target.value); setIsDirty(true); }}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Geofence type selector */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-2">Geofence Type</label>
                <div className="flex gap-2">
                  {[
                    { key: 'circle', label: '⬤ Circle' },
                    { key: 'polygon', label: '⬡ Polygon' }
                  ].map(({ key, label }) => (
                    <button key={key} type="button"
                      onClick={() => handleSwitchMode(key)}
                      className={`flex-1 rounded-xl py-2.5 text-xs font-semibold uppercase tracking-wider transition ${
                        geoType === key
                          ? 'bg-amber-500 text-[#080605] shadow-md font-bold'
                          : 'border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] hover:text-[#f5f0ea]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Circle Mode Specific Controls ── */}
              {geoType === 'circle' && (
                <div className="space-y-4 pt-1">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Center Latitude</label>
                      <input type="number" step="0.000001" required value={geoLat}
                        onChange={(e) => { setGeoLat(parseFloat(e.target.value) || 0); setIsDirty(true); }}
                        className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Center Longitude</label>
                      <input type="number" step="0.000001" required value={geoLng}
                        onChange={(e) => { setGeoLng(parseFloat(e.target.value) || 0); setIsDirty(true); }}
                        className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2 font-mono text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                      <span>Radius Distance</span>
                      <span className="font-mono text-amber-400 font-bold">{geoRadius} m</span>
                    </div>
                    <input type="range" min="20" max="500" step="5" value={geoRadius}
                      onChange={(e) => { setGeoRadius(parseInt(e.target.value, 10)); setIsDirty(true); }}
                      className="w-full accent-amber-500 h-1.5 rounded-lg bg-[#181512] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[#706860] mt-1 font-mono">
                      <span>20m</span><span>150m</span><span>500m</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Polygon Mode Specific Controls ── */}
              {geoType === 'polygon' && (
                <div className="space-y-4 pt-1">
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
                        Number of polygon edges / vertices
                      </label>
                      <select
                        value={polygonEdges}
                        onChange={(e) => handlePolygonEdgesChange(e.target.value)}
                        className="rounded-lg border border-amber-500/40 bg-[#181512] px-3 py-1 font-mono text-xs text-amber-400 font-bold focus:outline-none"
                      >
                        {Array.from({ length: 17 }, (_, i) => i + 4).map((n) => (
                          <option key={n} value={n}>
                            {n} Edges ({n} Vertices)
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[11px] text-[#a39b94] leading-relaxed">
                      Select how many vertices define your auditorium or classroom boundary.
                      Currently placed: <strong className="text-amber-400 font-mono">{polygonPoints.length}</strong> / {polygonEdges}.
                    </p>
                  </div>

                  {/* Vertices List / Table */}
                  {polygonPoints.length > 0 && (
                    <div className="rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-3 space-y-2 max-h-48 overflow-y-auto">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#a39b94]">
                        Boundary Coordinates ({polygonPoints.length} placed)
                      </div>
                      <div className="space-y-1">
                        {polygonPoints.map((pt, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs font-mono py-1 border-b border-[rgba(255,235,215,0.04)]">
                            <span className="flex items-center gap-1.5 text-amber-400 font-bold">
                              <span className="h-4 w-4 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">
                                {idx + 1}
                              </span>
                              Vertex {idx + 1}
                            </span>
                            <span className="text-[#f5f0ea]">
                              {pt.lat.toFixed(6)}, {pt.lng.toFixed(6)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" disabled={venueSaving || venueLoading}
                className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
              >
                <Save className="h-4 w-4" />
                <span>{venueSaving ? 'Saving…' : 'Save Venue Configuration'}</span>
              </button>
            </form>
          </div>
        </div>

        {/* ── SECTION 2: Saved Location Presets ─────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <BookmarkCheck className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Saved Location Presets</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Quick-Select Venues</h2>
              <p className="text-xs text-[#a39b94] mt-1">
                Manage reusable location presets. Click "Preview" to inspect exact boundary or "Apply to Active Venue" to activate.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingLocation({})}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#080605]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Preset</span>
            </button>
          </div>

          {locsLoading ? (
            <div className="flex items-center justify-center py-8 text-[#a39b94] text-xs">
              <RotateCcw className="h-4 w-4 animate-spin mr-2" /> Loading presets…
            </div>
          ) : savedLocations.length === 0 ? (
            <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-6 text-center text-xs text-[#706860]">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-[#554e48]" />
              <p>No location presets yet. Create one to quickly apply venue configurations.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {savedLocations.map((loc) => (
                <div
                  key={loc.id}
                  className={`rounded-xl border bg-[#181512] p-4 space-y-3 transition ${
                    previewLocation?.id === loc.id
                      ? 'border-amber-500 shadow-amber-glow'
                      : 'border-[rgba(255,235,215,0.08)] hover:border-[rgba(255,235,215,0.15)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider ${
                          loc.type === 'polygon' ? 'bg-violet-500/20 text-violet-400' : 'bg-amber-500/15 text-amber-400'
                        }`}>
                          {loc.type === 'polygon' ? 'Polygon' : 'Circle'}
                        </span>
                        {loc.is_default === 1 && <Star className="h-3 w-3 text-amber-400" fill="currentColor" />}
                      </div>
                      <h4 className="text-sm font-semibold text-[#f5f0ea] mt-1 truncate">{loc.name}</h4>
                      {loc.description && (
                        <p className="text-[11px] text-[#706860] truncate">{loc.description}</p>
                      )}
                      <p className="font-mono text-[10px] text-[#554e48] mt-1">
                        {loc.type === 'circle' ? (
                          <>
                            {loc.geo_lat?.toFixed(5)}, {loc.geo_lng?.toFixed(5)} • Radius: {loc.geo_radius_m}m
                          </>
                        ) : (
                          <>
                            Polygon Geofence (
                            {(() => {
                              try {
                                const pts = typeof loc.geo_corners === 'string' ? JSON.parse(loc.geo_corners) : loc.geo_corners;
                                return Array.isArray(pts) ? `${pts.length} vertices` : 'custom';
                              } catch {
                                return 'custom';
                              }
                            })()}
                            )
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        title="Preview on map"
                        type="button"
                        onClick={() => setPreviewLocation(previewLocation?.id === loc.id ? null : loc)}
                        className={`p-1.5 rounded-lg transition ${
                          previewLocation?.id === loc.id ? 'bg-amber-500/20 text-amber-400' : 'text-[#a39b94] hover:text-amber-400 hover:bg-amber-500/10'
                        }`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Edit preset"
                        type="button"
                        onClick={() => setEditingLocation(loc)}
                        className="p-1.5 rounded-lg text-[#a39b94] hover:text-[#f5f0ea] hover:bg-[#201c18] transition"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete preset"
                        type="button"
                        onClick={() => handleDeleteLocation(loc.id, loc.name)}
                        className="p-1.5 rounded-lg text-[#a39b94] hover:text-red-400 hover:bg-red-500/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Single clear action to apply preset */}
                  <button
                    type="button"
                    onClick={() => applyPresetToVenue(loc)}
                    className="w-full rounded-lg border border-amber-500/30 bg-amber-500/10 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition flex items-center justify-center gap-1.5"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Apply to Active Venue</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Preset Preview Panel — Accurately displays geometry without circular fallback */}
          {previewLocation && (
            <div className="rounded-xl border border-amber-500/30 bg-[#18130e] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded">
                      Preset Preview
                    </span>
                    <span className="text-sm font-semibold text-[#f5f0ea]">
                      {previewLocation.name}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#a39b94] mt-0.5">
                    {previewLocation.type === 'polygon'
                      ? 'Polygon Boundary (displaying exact vertices without circular radius)'
                      : `Circular Geofence (${previewLocation.geo_radius_m || 100}m radius)`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewLocation(null)}
                  className="rounded-full p-1 text-[#a39b94] hover:text-[#f5f0ea] hover:bg-[#221c17]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <VenueMapPicker
                lat={previewLocation.geo_lat}
                lng={previewLocation.geo_lng}
                radius={previewLocation.geo_radius_m || 100}
                mode={previewLocation.type || 'circle'}
                corners={(() => {
                  try {
                    return typeof previewLocation.geo_corners === 'string'
                      ? JSON.parse(previewLocation.geo_corners)
                      : (previewLocation.geo_corners || []);
                  } catch {
                    return [];
                  }
                })()}
                targetEdges={(() => {
                  try {
                    const c = typeof previewLocation.geo_corners === 'string'
                      ? JSON.parse(previewLocation.geo_corners)
                      : previewLocation.geo_corners;
                    return Array.isArray(c) ? c.length : 4;
                  } catch {
                    return 4;
                  }
                })()}
                readOnly
                height="260px"
              />
            </div>
          )}
        </div>

        {/* ── SECTION 3: Registration QR ────────────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <QrCode className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Official Static Registration Code</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">Student Roster QR Card</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFullscreenReg(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
                title="View Fullscreen Presentation for Auditoriums"
              >
                <Maximize2 className="h-3.5 w-3.5" />
                <span>Fullscreen</span>
              </button>
              <button type="button" onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#f5f0ea] hover:border-amber-500"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print QR</span>
              </button>
              <a href={displayQrSrc} download="MVJCE_Student_Registration_QR.png" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#080605]"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </a>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div className="flex flex-col items-center text-center">
              <div 
                onClick={() => setShowFullscreenReg(true)}
                className="group relative cursor-pointer rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-xl hover:border-amber-400 hover:shadow-[0_0_25px_rgba(240,150,80,0.25)] transition duration-200"
                title="Click to view Fullscreen Registration QR"
              >
                <div className="relative flex items-center justify-center">
                  <img src={displayQrSrc} alt="Student Registration Static QR Code" className="h-56 w-56 object-contain block group-hover:scale-[1.02] transition-transform duration-200" />
                  <QrNicOverlay />
                </div>
                <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-xs font-semibold gap-1 backdrop-blur-[1px]">
                  <Maximize2 className="h-6 w-6 text-amber-300 drop-shadow" />
                  <span className="text-amber-200 drop-shadow">Click for Fullscreen</span>
                </div>
              </div>
              <span className="mt-3 text-[11px] uppercase tracking-widest text-[#a39b94]">Permanent Static QR</span>
            </div>
            <div className="md:col-span-2 space-y-4 text-xs">
              <p className="text-[#a39b94] leading-relaxed">
                Print or display this QR code at the registration desk. Students scan this to reach the
                <strong className="text-[#f5f0ea]"> Student Registration</strong> page.
                The URL is encoded with the server-configured production domain.
              </p>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">Registration URL</label>
                <div className="flex items-center gap-2">
                  <input type="text" readOnly value={effectiveRegUrl}
                    className="flex-1 rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 font-mono text-xs text-[#f5f0ea] select-all focus:outline-none"
                  />
                  <button type="button" onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-xl border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-2.5 text-xs font-semibold text-amber-400 hover:border-amber-500 transition"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
              <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860] leading-relaxed">
                <strong className="text-[#f5f0ea]">Page Isolation Guard:</strong> Students who access this URL can only view the registration form. No links exist to attendance or admin panels.
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Change Password ────────────────────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl max-w-xl space-y-5">
          <div>
            <div className="flex items-center gap-2 text-amber-400 mb-1">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">Security Credentials</span>
            </div>
            <h2 className="font-serif text-2xl font-normal text-[#f5f0ea]">Change Admin Password</h2>
            <p className="mt-1 text-xs text-[#a39b94]">Update the master password for the Spotlight admin portal.</p>
          </div>

          {passwordMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium">{passwordMsg}</div>
          )}
          {passwordError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">{passwordError}</div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            {[
              ['Current Password', currentPassword, setCurrentPassword],
              ['New Password', newPassword, setNewPassword],
              ['Confirm New Password', confirmPassword, setConfirmPassword]
            ].map(([label, val, setter]) => (
              <div key={label}>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">{label}</label>
                <input type="password" required value={val} onChange={(e) => setter(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
            ))}
            <button type="submit" disabled={loadingPass}
              className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {loadingPass ? 'Updating…' : 'Save New Password'}
            </button>
          </form>
        </div>

        {/* ── SECTION 5: User Management & Access Control ────────────────── */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <Users className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">Access Control &amp; RBAC</span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">User Management</h2>
              <p className="mt-1 text-xs text-[#a39b94]">
                Create and manage authorized administrative accounts, assign roles, and configure granular permissions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadUsers}
                disabled={loadingUsers}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#f5f0ea] hover:border-amber-500 transition"
                title="Refresh user accounts list"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? 'animate-spin text-amber-400' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddUserModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold text-[#080605] shadow-amber-glow transition hover:opacity-95"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>Add New User</span>
              </button>
            </div>
          </div>

          {userMsg && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium">
              {userMsg}
            </div>
          )}
          {userError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
              {userError}
            </div>
          )}

          {/* User Accounts Table */}
          <div className="overflow-x-auto rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#14100c]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[rgba(255,235,215,0.08)] bg-[#181512] text-[10px] font-semibold uppercase tracking-wider text-[#a39b94]">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Permissions Summary</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(255,235,215,0.05)] text-[#f5f0ea]">
                {loadingUsers && users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-[#a39b94]">
                      Loading administrative user accounts…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-[#a39b94]">
                      No additional user accounts found. Click "Add New User" to create staff accounts.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => {
                    if (!u || typeof u !== 'object') return null;
                    const isPrimary = u.id === 1 || u.username === 'admin';
                    const perms = Array.isArray(u.permissions) ? u.permissions : [];
                    const isSuper = u.role === 'super_admin' || perms.includes('*');
                    const initial = ((u.display_name || u.username || 'U')[0] || 'U').toUpperCase();

                    return (
                      <tr key={u.id || Math.random()} className="hover:bg-[#181512]/60 transition">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                              {isPrimary ? (
                                <Shield className="h-4 w-4 text-amber-400" />
                              ) : (
                                <span className="font-semibold text-amber-400 uppercase text-[11px]">
                                  {initial}
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[#f5f0ea]">{u.display_name || u.username}</span>
                                {isPrimary && (
                                  <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                    Primary Admin
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] font-mono text-[#a39b94]">@{u.username}</span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            u.role === 'super_admin'
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                              : u.role === 'attendance_manager'
                              ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                              : u.role === 'qr_manager'
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                              : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                          }`}>
                            {u.role === 'super_admin' ? 'Super Admin'
                              : u.role === 'attendance_manager' ? 'Attendance Mgr'
                              : u.role === 'qr_manager' ? 'QR Manager'
                              : 'Custom Role'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          {isSuper ? (
                            <span className="text-purple-300 font-medium text-[11px] flex items-center gap-1">
                              <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                              Full System Access (*)
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {perms.slice(0, 3).map(p => (
                                <span key={p} className="px-1.5 py-0.5 rounded bg-[#181512] border border-[rgba(255,235,215,0.06)] text-[10px] text-[#a39b94]">
                                  {p.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {perms.length > 3 && (
                                <span className="px-1.5 py-0.5 rounded bg-[#181512] text-[10px] text-amber-400 font-mono">
                                  +{perms.length - 3} more
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          {isPrimary ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                              <UserCheck className="h-3 w-3" />
                              Active (Permanent)
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserActive(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border transition ${
                                u.is_active
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                                  : 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/25'
                              }`}
                              title={u.is_active ? 'Click to deactivate' : 'Click to activate'}
                            >
                              {u.is_active ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                              <span>{u.is_active ? 'Active' : 'Deactivated'}</span>
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingUser(u)}
                              className="rounded-lg border border-[rgba(255,235,215,0.1)] bg-[#181512] p-1.5 text-[#f5f0ea] hover:border-amber-500 hover:text-amber-400 transition"
                              title="Edit user details and permissions"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>

                            {!isPrimary && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="rounded-lg border border-red-500/20 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 transition"
                                title="Delete user account"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Saved Location Modal ────────────────────────────────────────── */}
      {editingLocation !== null && (
        <SavedLocationModal
          location={Object.keys(editingLocation).length > 0 ? editingLocation : null}
          onSave={handleSaveLocation}
          onClose={() => setEditingLocation(null)}
        />
      )}

      {/* ── Add User Modal ─────────────────────────────────────────────── */}
      {showAddUserModal && (
        <AddUserModal
          onSave={handleCreateUser}
          onClose={() => setShowAddUserModal(false)}
        />
      )}

      {/* ── Edit User Modal ────────────────────────────────────────────── */}
      {editingUser !== null && (
        <EditUserModal
          user={editingUser}
          onSave={handleUpdateUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* ── Fullscreen Registration QR Modal ────────────────────────────── */}
      <FullscreenRegistrationModal
        isOpen={showFullscreenReg}
        onClose={() => setShowFullscreenReg(false)}
        qrSrc={displayQrSrc}
        registrationUrl={effectiveRegUrl}
      />
    </AdminLayout>
  );
}
