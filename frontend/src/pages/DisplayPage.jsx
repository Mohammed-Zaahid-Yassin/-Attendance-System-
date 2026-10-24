import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { 
  Users, 
  Clock, 
  Maximize2, 
  Minimize2, 
  Sparkles, 
  ShieldCheck, 
  Tv, 
  RotateCcw 
} from 'lucide-react';

export default function DisplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionFromUrl = searchParams.get('session');

  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(
    sessionFromUrl ? parseInt(sessionFromUrl, 10) : null
  );
  const [tokenData, setTokenData] = useState(null);
  const [liveAttendanceCount, setLiveAttendanceCount] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 1. Fetch Active Sessions periodically
  useEffect(() => {
    let isMounted = true;
    const fetchActiveSessions = async () => {
      try {
        const res = await axios.get('/api/sessions/active');
        const list = res.data.sessions || [];
        if (!isMounted) return;
        setActiveSessions(list);
        if (list.length > 0) {
          // If URL param specified an active session, use it
          if (sessionFromUrl && list.some(s => s.id === parseInt(sessionFromUrl, 10))) {
            setSelectedSessionId(parseInt(sessionFromUrl, 10));
          } else if (!selectedSessionId || !list.some(s => s.id === selectedSessionId)) {
            setSelectedSessionId(list[0].id);
            setSearchParams({ session: String(list[0].id) }, { replace: true });
          }
        }
      } catch (err) {
        console.error('Failed to load active sessions', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [sessionFromUrl]);

  // 2. Poll QR token and PIN for the selected session
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchToken = async () => {
      try {
        const [qrRes, liveRes] = await Promise.all([
          axios.get(`/api/token/qr/${selectedSessionId}`),
          axios.get(`/api/attendance/live/${selectedSessionId}`)
        ]);

        const data = qrRes.data;
        setTokenData(data);
        setLiveAttendanceCount(liveRes.data?.count || 0);

        if (data.expires_at) {
          const remainingSecs = Math.max(0, Math.ceil((data.expires_at - Date.now()) / 1000));
          setSecondsRemaining(remainingSecs);
        }
      } catch (err) {
        console.error('Failed to fetch QR token', err);
      }
    };

    fetchToken();
    const interval = setInterval(fetchToken, 2000);

    // Smooth client-side 1s countdown tick
    const tickInterval = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(interval);
      clearInterval(tickInterval);
    };
  }, [selectedSessionId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const currentSession = activeSessions.find((s) => s.id === selectedSessionId);
  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / 25) * 100));

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] text-[#f5f0ea]">
        <div className="flex flex-col items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500"></div>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#a39b94]">
            Initializing Auditorium Display...
          </p>
        </div>
      </div>
    );
  }

  // No active session view
  if (!activeSessions.length || !currentSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#080605] p-6 text-center text-[#f5f0ea]">
        <div className="max-w-md rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
            <Tv className="h-7 w-7" />
          </div>
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
            MVJ College of Engineering
          </p>
          <h2 className="mt-1 font-serif text-2xl font-normal text-[#f5f0ea]">
            Auditorium Projector Standby
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-[#a39b94]">
            No lecture or event session is currently active. The administrator can launch a session from the Admin Control Dashboard.
          </p>
          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860]">
            Display screen auto-refreshes every 5 seconds to detect newly started sessions.
          </div>
        </div>
      </div>
    );
  }

  const isPinRequired = tokenData?.pin_required !== false;
  const isStaticQr = currentSession?.static_qr_mode === 1;

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#080605] text-[#f5f0ea] p-4 sm:p-8 select-none">
      {/* Top Bar: MVJCE Branding + Session Selector + Fullscreen Button */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-5">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                MVJ College of Engineering
              </span>
              <span className="text-amber-500">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">
                Spotlight
              </span>
            </div>
            <h1 className="font-serif text-xl sm:text-2xl font-normal text-[#f5f0ea]">
              {currentSession.subject_name}{' '}
              <span className="italic text-amber-400 font-normal">
                (Hour {currentSession.hour_number})
              </span>
            </h1>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-3">
          {activeSessions.length > 1 && (
            <select
              value={selectedSessionId || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setSelectedSessionId(val);
                setSearchParams({ session: String(val) });
              }}
              aria-label="Select active classroom session"
              className="rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-1.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            >
              {activeSessions.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#120f0d]">
                  Hour {s.hour_number}: {s.subject_name}
                </option>
              ))}
            </select>
          )}

          {/* Live Headcount Pill */}
          <div className="flex items-center gap-2 rounded-full border border-[rgba(240,150,80,0.25)] bg-[#18130e] px-4 py-2 text-xs">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm font-bold text-[#f5f0ea]">{liveAttendanceCount}</span>
            <span className="text-[#a39b94] text-[11px] uppercase tracking-wider">Recorded</span>
          </div>

          {/* Fullscreen Button */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle Fullscreen"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] transition hover:border-amber-500 hover:text-amber-400 focus-visible:outline-none"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main Display Area */}
      <main className="my-auto py-6 sm:py-10">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-10 items-center justify-center">
          {/* QR Code Card */}
          <div className="flex flex-col items-center text-center">
            <div className="relative rounded-3xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 sm:p-8 shadow-2xl">
              {tokenData?.qr_code ? (
                <img
                  src={tokenData.qr_code}
                  alt="Attendance QR Code"
                  className="h-64 w-64 sm:h-72 sm:w-72 rounded-2xl bg-white p-3 shadow-inner object-contain"
                />
              ) : (
                <div className="h-64 w-64 sm:h-72 sm:w-72 flex items-center justify-center rounded-2xl bg-[#181512]">
                  <RotateCcw className="h-8 w-8 animate-spin text-amber-400" />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Screen PIN (if active) + Rotation Countdown Timer */}
          <div className="flex flex-col space-y-6 w-full">
            {isPinRequired && (
              <div className="w-full rounded-3xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 sm:p-10 shadow-2xl text-center md:text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                  Screen PIN
                </span>
                <div className="mt-4 font-mono text-5xl sm:text-7xl font-black tracking-[0.2em] text-amber-400">
                  {tokenData?.unique_pin || '••••••'}
                </div>
              </div>
            )}

            {/* Disguised Rotation Progress Bar — hidden in Static QR mode */}
            {isStaticQr ? (
              <div className="w-full rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 shadow-xl text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
                    Static QR – Frozen
                  </span>
                </div>
                <p className="text-xs text-[#a39b94] leading-relaxed">
                  QR rotation is paused. All students share the same code until the admin re-enables dynamic mode.
                </p>
              </div>
            ) : (
              <div className="w-full rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-6 shadow-xl">
                <div className="flex items-center justify-between text-xs mb-3">
                  <span className="flex items-center gap-2 text-[#a39b94] uppercase tracking-wider text-[11px]">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                    Rotating Anti-Proxy Shield:
                  </span>
                  <span className="font-mono text-amber-400 text-xs font-semibold uppercase tracking-wider">
                    Dynamic Token
                  </span>
                </div>

                {/* Disguised Progress track */}
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#181512]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 transition-all duration-1000 ease-linear shadow-amber-glow"
                    style={{ width: `${Math.max(8, Math.min(100, (secondsRemaining / 33) * 100))}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Student Instruction */}
        <p className="mt-8 text-center text-xs text-[#a39b94]">
          Scan the QR code using your mobile camera{isPinRequired ? ' and enter the screen PIN ' : ' '}to mark attendance.
          {isStaticQr && <span className="ml-1 text-emerald-400 font-medium">(Static Mode — QR is frozen)</span>}
        </p>
      </main>

      {/* Footer Notice */}
      <footer className="border-t border-[rgba(255,235,215,0.06)] pt-4 text-center text-[11px] text-[#706860]">
        MVJ College of Engineering • Departmental Lecture & Event Attendance System
      </footer>
    </div>
  );
}
