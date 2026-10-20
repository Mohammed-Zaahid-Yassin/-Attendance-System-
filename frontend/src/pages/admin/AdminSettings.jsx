import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AdminLayout from '../../components/AdminLayout';
import { 
  QrCode, 
  KeyRound, 
  Download, 
  Copy, 
  Check, 
  Lock, 
  Sparkles,
  Printer
} from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

export default function AdminSettings() {
  const [regData, setRegData] = useState(null);
  const [copied, setCopied] = useState(false);

  // Change password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loadingPass, setLoadingPass] = useState(false);

  const token = localStorage.getItem('admin_token');
  const axiosConfig = {
    headers: { Authorization: `Bearer ${token}` }
  };

  useEffect(() => {
    const fetchRegQR = async () => {
      try {
        const res = await axios.get('/api/admin/registration-qr', axiosConfig);
        setRegData(res.data);
      } catch (err) {
        console.error('Failed to load registration QR', err);
      }
    };

    fetchRegQR();
  }, []);

  const handleCopyLink = async () => {
    if (regData?.url) {
      const ok = await copyToClipboard(regData.url);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPasswordMsg('');
    setPasswordError('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    setLoadingPass(true);

    try {
      await axios.post(
        '/api/admin/change-password',
        {
          current_password: currentPassword,
          new_password: newPassword
        },
        axiosConfig
      );
      setPasswordMsg('Admin password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoadingPass(false);
    }
  };

  const handlePrintQR = () => {
    window.print();
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-500">
                System Administration
              </span>
            </div>
            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea] mt-1">
              Settings & <span className="italic text-amber-400">Static Enrollment QR.</span>
            </h1>
          </div>
        </div>

        {/* Section 1: Confidential Static Student Registration QR */}
        <div className="rounded-2xl border border-[rgba(240,150,80,0.25)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400">
                <QrCode className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Official Static Registration Code
                </span>
              </div>
              <h2 className="font-serif text-2xl font-normal text-[#f5f0ea] mt-1">
                Student Roster QR Card
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintQR}
                className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-1.5 text-xs font-medium text-[#f5f0ea] hover:border-amber-500"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print QR Sheet</span>
              </button>

              {regData?.qr_code && (
                <a
                  href={regData.qr_code}
                  download="MVJCE_Student_Registration_Static_QR.png"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Image</span>
                </a>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            {/* QR Image Display */}
            <div className="flex flex-col items-center text-center">
              {regData?.qr_code ? (
                <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-white p-3 shadow-xl">
                  <img
                    src={regData.qr_code}
                    alt="Student Registration Static QR Code"
                    className="h-56 w-56 object-contain"
                  />
                </div>
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-2xl bg-[#181512] text-xs text-[#706860]">
                  Loading QR Code...
                </div>
              )}
              <span className="mt-3 text-[11px] uppercase tracking-widest text-[#a39b94]">
                Permanent Static QR
              </span>
            </div>

            {/* Description & URL */}
            <div className="md:col-span-2 space-y-4 text-xs">
              <p className="text-[#a39b94] leading-relaxed">
                This is the static registration QR code. Print or display this QR code at the registration desk. Students scanning this QR code arrive directly at the <strong className="text-[#f5f0ea]">Student Registration</strong> page.
              </p>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                  Confidential Registration URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={regData?.url || ''}
                    className="flex-1 rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-2.5 font-mono text-xs text-[#f5f0ea] select-all focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 rounded-xl border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-2.5 text-xs font-semibold text-amber-400 hover:border-amber-500 transition"
                  >
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860] leading-relaxed">
                <strong className="text-[#f5f0ea]">Page Isolation Guard:</strong> Students who access this registration URL can only view the registration form. No links exist to attendance or administrator control panels.
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Administrator Credentials Update */}
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 sm:p-8 shadow-xl max-w-xl">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Lock className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              Security Credentials
            </span>
          </div>
          <h2 className="font-serif text-2xl font-normal text-[#f5f0ea]">
            Change Admin Password
          </h2>
          <p className="mt-1 text-xs text-[#a39b94] mb-6">
            Update the master password for the Spotlight administrator portal.
          </p>

          {passwordMsg && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400 font-medium">
              {passwordMsg}
            </div>
          )}

          {passwordError && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400 font-medium">
              {passwordError}
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] px-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loadingPass}
              className="w-full min-h-[44px] rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {loadingPass ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
