import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Users,
  Maximize2,
  Minimize2,
  Tv,
  RotateCcw
} from 'lucide-react';

/**
 * ClockRingTimer — SVG clock-hand style outline around the QR code.
 *
 * One full clockwise revolution = `totalMs` milliseconds.
 * The hand starts at 12 o'clock and sweeps clockwise.
 * Uses server-issued `expiresAt` (Unix ms) for accuracy.
 * rAF-based — stays smooth; recovers from tab suspension.
 */
function ClockRingTimer({ expiresAt, totalMs, size = 300 }) {
  const rafRef = useRef(null);
  const [progress, setProgress] = useState(1); // 1 = full (just issued), 0 = expired

  const tick = useCallback(() => {
    const now = Date.now();
    const remaining = expiresAt - now;
    const p = Math.max(0, Math.min(1, remaining / totalMs));
    setProgress(p);
    if (p > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [expiresAt, totalMs]);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  const strokeWidth = 6;
  const radius = size / 2 - strokeWidth / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  // Offset: starts at 12 o'clock (SVG default starts at 3 o'clock → rotate -90°)
  const dashOffset = circumference * (1 - progress);

  // Clock hand: line from center to edge at current angle
  const angle = (1 - progress) * 2 * Math.PI - Math.PI / 2; // -90° offset
  const handLength = radius - 4;
  const hx = cx + handLength * Math.cos(angle);
  const hy = cy + handLength * Math.sin(angle);

  // Color shifts from amber → red as time runs out
  const isLow = progress < 0.25;
  const ringColor = isLow ? '#ef4444' : '#f59e0b';
  const handColor = isLow ? '#fca5a5' : '#fcd34d';

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        // Respect reduced-motion: stop ring animation (hand still shows state)
      }}
      aria-hidden="true"
    >
      {/* Background track ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="rgba(255,235,215,0.08)"
        strokeWidth={strokeWidth}
      />
      {/* Progress arc */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={ringColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ transition: 'stroke 0.5s ease' }}
      />
      {/* Clock center dot */}
      <circle cx={cx} cy={cy} r={3} fill={handColor} />
      {/* Clock hand */}
      <line
        x1={cx}
        y1={cy}
        x2={hx}
        y2={hy}
        stroke={handColor}
        strokeWidth={2.5}
        strokeLinecap="round"
        opacity={0.9}
      />
    </svg>
  );
}

export default function DisplayPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sessionFromUrl = searchParams.get('session');

  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(
    sessionFromUrl ? parseInt(sessionFromUrl, 10) : null
  );
  const [tokenData, setTokenData] = useState(null);
  const [liveAttendanceCount, setLiveAttendanceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qrContainerSize, setQrContainerSize] = useState(320);

  const qrWrapRef = useRef(null);

  // ── Measure available space for QR ────────────────────────────────────
  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // QR should fill most of available space, capped at 520px
      const available = Math.min(vw * 0.9, vh * 0.55, 520);
      setQrContainerSize(Math.floor(Math.max(240, available)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // ── Fullscreen change listener ─────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // ── 1. Fetch Active Sessions ──────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const fetchActiveSessions = async () => {
      try {
        const res = await axios.get('/api/sessions/active');
        const list = res.data.sessions || [];
        if (!isMounted) return;
        setActiveSessions(list);
        if (list.length > 0) {
          if (sessionFromUrl && list.some((s) => s.id === parseInt(sessionFromUrl, 10))) {
            setSelectedSessionId(parseInt(sessionFromUrl, 10));
          } else if (!selectedSessionId || !list.some((s) => s.id === selectedSessionId)) {
            setSelectedSessionId(list[0].id);
            setSearchParams({ session: String(list[0].id) }, { replace: true });
          }
        }
      } catch {}
      finally { if (isMounted) setLoading(false); }
    };
    fetchActiveSessions();
    const interval = setInterval(fetchActiveSessions, 5000);
    return () => { isMounted = false; clearInterval(interval); };
  }, [sessionFromUrl]);

  // ── 2. Poll QR token — server-synced timing ───────────────────────────
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchToken = async () => {
      try {
        const [qrRes, liveRes] = await Promise.all([
          axios.get(`/api/token/qr/${selectedSessionId}`),
          axios.get(`/api/attendance/live/${selectedSessionId}`)
        ]);
        setTokenData(qrRes.data);
        setLiveAttendanceCount(liveRes.data?.count || 0);
      } catch (err) {
        console.error('Failed to fetch QR token', err);
      }
    };

    fetchToken();
    const interval = setInterval(fetchToken, 2000);
    return () => clearInterval(interval);
  }, [selectedSessionId]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const currentSession = activeSessions.find((s) => s.id === selectedSessionId);

  // ── Loading screen ────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#080605] text-[#f5f0ea]">
        <div className="flex flex-col items-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-amber-500/30 border-t-amber-500" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[#a39b94]">
            Initializing Display…
          </p>
        </div>
      </div>
    );
  }

  // ── No active session ─────────────────────────────────────────────────
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
            No lecture or event session is currently active.
          </p>
          <div className="mt-6 rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860]">
            Display auto-refreshes every 5 seconds.
          </div>
        </div>
      </div>
    );
  }

  const isPinRequired = tokenData?.pin_required !== false;
  const isStaticQr = currentSession?.static_qr_mode === 1;

  // Derive server-accurate timer values
  const expiresAt = tokenData?.expires_at ?? (Date.now() + 30000);
  // Time the token was ISSUED (expires_at - time_remaining approximation using polled data)
  // Use the time_remaining_ms from server; totalMs = the full window we infer
  const totalMs = tokenData?.time_remaining_ms != null
    ? (tokenData.expires_at - Date.now() + tokenData.time_remaining_ms)
    : 33000; // Fallback: assume 33s mid-window default

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#080605] text-[#f5f0ea] p-4 sm:p-6 select-none">
      {/* Top Bar */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(255,235,215,0.08)] pb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
              MVJ College of Engineering
            </span>
            <span className="text-amber-500">•</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-400">Spotlight</span>
          </div>
          <h1 className="font-serif text-xl sm:text-2xl font-normal text-[#f5f0ea]">
            {currentSession.subject_name}{' '}
            <span className="italic text-amber-400 font-normal">(Hour {currentSession.hour_number})</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {activeSessions.length > 1 && (
            <select
              value={selectedSessionId || ''}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setSelectedSessionId(val);
                setSearchParams({ session: String(val) });
              }}
              className="rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] px-3.5 py-1.5 text-xs text-[#f5f0ea] focus:border-amber-500 focus:outline-none"
            >
              {activeSessions.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#120f0d]">
                  Hour {s.hour_number}: {s.subject_name}
                </option>
              ))}
            </select>
          )}

          {/* Live headcount */}
          <div className="flex items-center gap-2 rounded-full border border-[rgba(240,150,80,0.25)] bg-[#18130e] px-4 py-2 text-xs">
            <Users className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm font-bold text-[#f5f0ea]">{liveAttendanceCount}</span>
            <span className="text-[#a39b94] text-[11px] uppercase tracking-wider">Recorded</span>
          </div>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle Fullscreen"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] text-[#a39b94] transition hover:border-amber-500 hover:text-amber-400"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      {/* Main Display: centered QR + clock ring */}
      <main className="flex flex-1 flex-col items-center justify-center py-6 sm:py-8">
        {/* QR + integrated clock ring */}
        <div
          ref={qrWrapRef}
          className="relative flex items-center justify-center"
          style={{ width: qrContainerSize + 28, height: qrContainerSize + 28 }}
        >
          {/* Clock ring SVG (behind QR) */}
          {!isStaticQr && tokenData?.expires_at && (
            <ClockRingTimer
              expiresAt={expiresAt}
              totalMs={Math.max(totalMs, 5000)}
              size={qrContainerSize + 28}
            />
          )}

          {/* Static QR mode: simple green pulse ring instead */}
          {isStaticQr && (
            <div
              className="absolute inset-0 rounded-full border-2 border-emerald-500/40 animate-pulse"
              style={{ borderRadius: '50%' }}
            />
          )}

          {/* QR Image */}
          <div
            className="relative z-10 rounded-2xl bg-white shadow-2xl overflow-hidden"
            style={{
              width: qrContainerSize,
              height: qrContainerSize,
              padding: Math.floor(qrContainerSize * 0.025)
            }}
          >
            {tokenData?.qr_code ? (
              <img
                src={tokenData.qr_code}
                alt="Attendance QR Code"
                className="h-full w-full object-contain block"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[#181512] rounded-xl">
                <RotateCcw className="h-10 w-10 animate-spin text-amber-400" />
              </div>
            )}
          </div>
        </div>

        {/* Screen PIN (if required) */}
        {isPinRequired && (
          <div className="mt-6 rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] px-10 py-6 text-center shadow-xl">
            <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
              Screen PIN
            </span>
            <div className="mt-3 font-mono text-5xl sm:text-7xl font-black tracking-[0.2em] text-amber-400">
              {tokenData?.unique_pin || '••••••'}
            </div>
          </div>
        )}

        {/* Static QR label */}
        {isStaticQr && (
          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-3 text-center text-xs text-emerald-400 font-medium">
            <span className="relative flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Static QR Mode — Frozen until admin changes
            </span>
          </div>
        )}

        {/* Student instruction */}
        <p className="mt-6 text-center text-sm text-[#a39b94] max-w-md leading-relaxed">
          Scan the QR code using your mobile camera
          {isPinRequired ? ' and enter the screen PIN ' : ' '}
          to mark attendance.
        </p>
      </main>

      <footer className="border-t border-[rgba(255,235,215,0.06)] pt-3 text-center text-[11px] text-[#706860]">
        MVJ College of Engineering • Departmental Lecture &amp; Event Attendance System
      </footer>
    </div>
  );
}
