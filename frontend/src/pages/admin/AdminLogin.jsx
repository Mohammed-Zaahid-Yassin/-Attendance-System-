import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, ArrowRight } from 'lucide-react';

export default function AdminLogin() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      navigate('/admin/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);

    try {
      const res = await axios.post('/api/auth/login', { username, password });
      localStorage.setItem('admin_token', res.data.token);
      localStorage.setItem('admin_user', JSON.stringify(res.data.admin));
      navigate('/admin/dashboard');
    } catch (err) {
      console.error('[AdminLogin Error]', err);
      const serverMsg = err.response?.data?.error;
      const networkMsg = err.message;
      setErrorMsg(serverMsg || (networkMsg && networkMsg !== 'Network Error' ? networkMsg : 'Invalid credentials or network timeout. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080605] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 sm:p-10 shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
                Spotlight
              </span>
            </div>

            <h1 className="font-serif text-3xl font-normal text-[#f5f0ea]">
              Admin <span className="italic text-amber-400">Portal.</span>
            </h1>
            <p className="mt-2 text-xs text-[#a39b94]">
              Sign in to manage lecture sessions, geofences, and roster.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-6 rounded-xl border border-red-500/25 bg-red-500/10 p-3.5 text-xs font-semibold text-red-300 text-center">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1.5">
                Username
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#706860]">
                  <User className="h-4 w-4" />
                </div>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] pl-10 pr-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#a39b94] mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#706860]">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#181512] pl-10 pr-4 py-2.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-6 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 py-3 text-xs font-semibold uppercase tracking-wider text-[#080605] shadow-amber-glow transition hover:opacity-95 disabled:opacity-50"
            >
              {loading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-[11px] text-[#706860]">
            Default credentials: <span className="font-mono text-[#a39b94]">Try your best</span>
          </div>
        </div>
      </div>
    </div>
  );
}
