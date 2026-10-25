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
 * ClockRingTimer — High-contrast circular progress countdown outline surrounding the QR code.
 *
 * Implements authoritative server-timestamp progress calculation:
 * - t_i: token issuance time (issuedAt)
 * - t_e: token expiration time (expiresAt)
 * - t_n: current time adjusted by server clock skew (Date.now() + serverTimeOffset)
 * - p = clamp((t_n - t_i) / (t_e - t_i), 0, 1)
 * - remaining ms = max(0, t_e - t_n)
 *
 * Visual geometry:
 * - Clock sweep begins at 12 o'clock (-90°).
 * - Circular endpoint bead travels clockwise along circumference at angle -90° + p * 360°.
 * - High-contrast orange progress arc extends from the moving bead clockwise to 12 o'clock.
 * - Visible arc length is exactly C * (1 - p).
 * - Bead and arc are mathematically unified: the bead is always attached to the arc tip.
 * - Normal: vibrant orange (#f97316).
 * - Last 6 seconds: warning amber (#f59e0b).
 * - Expired: distinct red (#ef4444) with bead hidden.
 */
export function ClockRingTimer({ issuedAt, expiresAt, durationMs, serverTimeOffset = 0, size = 460, onExpire }) {
  const rafRef = useRef(null);
  const expiredNotifiedRef = useRef(false);

  const computeState = useCallback(() => {
    const now = Date.now() + (serverTimeOffset || 0);
    const te = expiresAt;
    const r = Math.max(0, te - now);
    // Proportion of full amount: use durationMs, or (expiresAt - issuedAt), or dynamic remaining window
    const total = Math.max(1000, durationMs || (issuedAt ? te - issuedAt : 0) || Math.max(30000, r));
    const remainingFraction = Math.max(0, Math.min(1, r / total));
    const p = 1 - remainingFraction;
    return { progress: p, remainingMs: r, remainingFraction, totalDuration: total };
  }, [issuedAt, expiresAt, durationMs, serverTimeOffset]);

  const [state, setState] = useState(computeState);

  const tick = useCallback(() => {
    const s = computeState();
    setState(s);

    if (s.remainingMs <= 0 && !expiredNotifiedRef.current) {
      expiredNotifiedRef.current = true;
      if (onExpire) onExpire();
    }

    if (s.remainingMs > 0) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [computeState, onExpire]);

  useEffect(() => {
    expiredNotifiedRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const s = computeState();
        setState(s);
        if (s.remainingMs > 0) {
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
          rafRef.current = requestAnimationFrame(tick);
        } else if (!expiredNotifiedRef.current) {
          expiredNotifiedRef.current = true;
          if (onExpire) onExpire();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tick, computeState, onExpire]);

  const { progress, remainingMs, remainingFraction } = state;
  const strokeWidth = 9;
  const radius = Math.max(20, size / 2 - strokeWidth - 6);
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Clockwise countdown:
  // As progress goes from 0 to 1, the bead moves clockwise from 12 o'clock (-90°):
  const angleDeg = -90 + progress * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const beadX = cx + radius * Math.cos(angleRad);
  const beadY = cy + radius * Math.sin(angleRad);

  // Arc starts at the bead (at angleDeg) and extends clockwise to 12 o'clock:
  // Visible arc length is C * (1 - progress).
  // With SVG strokeDasharray = [C, C] and strokeDashoffset = C * progress,
  // rotated by angleDeg: the visible dash begins at angleDeg and ends at -90° (12 o'clock).
  const dashOffset = circumference * progress;

  // Smooth multi-step color gradient:
  // - 100% remaining: Vibrant Spotlight Orange [249, 115, 22] (#f97316)
  // - 50% remaining (half-time): Pure Electric Yellow [250, 204, 21] (#facc15)
  // - 25% remaining (quarter-time): High-Contrast Warning Red [239, 68, 68] (#ef4444)
  // - 0% remaining (expired): Deep Red [220, 38, 38] (#dc2626)
  const isExpired = remainingMs <= 0 || progress >= 1;
  let rColor, gColor, bColor;

  if (isExpired) {
    rColor = 239;
    gColor = 68;
    bColor = 68;
  } else {
    const f = Math.max(0, Math.min(1, remainingFraction != null ? remainingFraction : (1 - progress)));
    if (f >= 0.5) {
      // 100% -> 50%: Smooth blend from Orange to Yellow
      const t = (1.0 - f) / 0.5; // 0 at f=1.0, 1 at f=0.5
      rColor = Math.round(249 + (250 - 249) * t);
      gColor = Math.round(115 + (204 - 115) * t);
      bColor = Math.round(22 + (21 - 22) * t);
    } else if (f >= 0.25) {
      // 50% -> 25%: Smooth blend from Yellow to Red
      const t = (0.5 - f) / 0.25; // 0 at f=0.5, 1 at f=0.25
      rColor = Math.round(250 + (239 - 250) * t);
      gColor = Math.round(204 + (68 - 204) * t);
      bColor = Math.round(21 + (68 - 21) * t);
    } else {
      // 25% -> 0%: Smooth deepening from Red to Dark Red
      const t = (0.25 - f) / 0.25; // 0 at f=0.25, 1 at f=0
      rColor = Math.round(239 + (220 - 239) * t);
      gColor = Math.round(68 + (38 - 68) * t);
      bColor = Math.round(68 + (38 - 68) * t);
    }
  }

  const ringColor = `rgb(${rColor}, ${gColor}, ${bColor})`;
  const trackColor = `rgba(${rColor}, ${gColor}, ${bColor}, 0.20)`;
  const beadGlow = `rgba(${rColor}, ${gColor}, ${bColor}, 0.45)`;

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 5
      }}
      aria-label="QR validity countdown ring"
    >
      <defs>
        <filter id="timerGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Outer subtle halo ring */}
      <circle
        cx={cx}
        cy={cy}
        r={radius + strokeWidth / 2 + 1}
        fill="none"
        stroke={isExpired ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.08)'}
        strokeWidth={1}
      />

      {/* Subdued but clearly visible background track for entire circumference */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />

      {/* 12 o'clock origin/target anchor marker */}
      <circle
        cx={cx}
        cy={cy - radius}
        r={3}
        fill={isExpired ? '#ef4444' : 'rgba(255, 235, 215, 0.45)'}
      />

      {/* Active High-Contrast Progress Arc */}
      {!isExpired && progress < 1 && (
        <circle
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(${angleDeg} ${cx} ${cy})`}
          style={{
            filter: 'drop-shadow(0 0 4px rgba(249, 115, 22, 0.5))',
            transition: 'stroke 0.3s ease'
          }}
        />
      )}

      {/* Moving Circular Endpoint Bead Indicator */}
      {!isExpired && progress < 1 && (
        <g>
          {/* Outer glow ring */}
          <circle cx={beadX} cy={beadY} r={10} fill={beadGlow} />
          {/* Main bead marker */}
          <circle
            cx={beadX}
            cy={beadY}
            r={6}
            fill={ringColor}
            stroke="#ffffff"
            strokeWidth={2}
          />
        </g>
      )}
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
  const serverTimeOffsetRef = useRef(0);
  const fetchingRef = useRef(false);
  const activeTokenRef = useRef(null);

  useEffect(() => {
    activeTokenRef.current = tokenData;
  }, [tokenData]);

  // ── Measure available space for QR and surrounding countdown ring ────
  useEffect(() => {
    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const availableW = vw * 0.85;
      const availableH = vh * 0.52;
      const maxOuter = Math.min(availableW, availableH, 560);
      // Ring outer diameter is Math.ceil(qr * 1.44 + 32), so derive qr from maxOuter:
      const computedQr = Math.floor(Math.max(200, (maxOuter - 32) / 1.44));
      setQrContainerSize(computedQr);
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

  // ── 2. Poll QR token — synchronized state & rotation ──────────────────
  const fetchToken = useCallback(async () => {
    if (!selectedSessionId || fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const originParam = encodeURIComponent(window.location.origin);
      const [qrRes, liveRes] = await Promise.all([
        axios.get(`/api/token/qr/${selectedSessionId}?origin=${originParam}`),
        axios.get(`/api/attendance/live/${selectedSessionId}`)
      ]);

      const data = qrRes.data;
      if (data && data.server_time) {
        serverTimeOffsetRef.current = data.server_time - Date.now();
      }

      setLiveAttendanceCount(liveRes.data?.count || 0);

      // Guard: reject stale response older than currently displayed token
      const current = activeTokenRef.current;
      if (current && data.expires_at < current.expires_at) {
        return;
      }

      // If token payload has not changed, do NOT reset timer or re-trigger state
      if (current && data.token === current.token) {
        return;
      }

      // Authoritative coordinated transition: new token & timestamps
      setTokenData(data);
    } catch (err) {
      console.error('Failed to fetch QR token', err);
    } finally {
      fetchingRef.current = false;
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (!selectedSessionId) return;
    fetchToken();
    const interval = setInterval(fetchToken, 2000);
    return () => clearInterval(interval);
  }, [selectedSessionId, fetchToken]);

  // When countdown expires, immediately fetch next rotated token
  const handleTokenExpire = useCallback(() => {
    fetchToken();
  }, [fetchToken]);

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
        {/* QR + integrated countdown ring */}
        {(() => {
          const ringOuterSize = Math.ceil(qrContainerSize * 1.44 + 32);
          return (
            <div
              ref={qrWrapRef}
              className="relative flex items-center justify-center my-3"
              style={{ width: ringOuterSize, height: ringOuterSize }}
            >
              {/* Clock ring SVG surrounding the QR code */}
              {!isStaticQr && tokenData?.expires_at && (
                <ClockRingTimer
                  key={tokenData.token}
                  issuedAt={tokenData.issued_at}
                  expiresAt={tokenData.expires_at}
                  durationMs={tokenData.duration_ms}
                  serverTimeOffset={serverTimeOffsetRef.current}
                  size={ringOuterSize}
                  onExpire={handleTokenExpire}
                />
              )}

              {/* Static QR mode: prominent green status ring instead */}
              {isStaticQr && (
                <div
                  className="absolute rounded-full border-2 border-emerald-500/40 animate-pulse pointer-events-none"
                  style={{ width: ringOuterSize - 16, height: ringOuterSize - 16 }}
                />
              )}

              {/* QR Image card */}
              <div
                className="relative z-10 rounded-2xl bg-white shadow-2xl overflow-hidden border border-[rgba(255,235,215,0.2)]"
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
          );
        })()}

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

        {/* Student instruction + Student ID reminder */}
        <div className="mt-6 w-full max-w-md text-center space-y-3">
          <p className="text-sm text-[#a39b94] leading-relaxed">
            Scan the QR code using your mobile camera
            {isPinRequired ? ' and enter the screen PIN ' : ' '}
            to mark attendance.
          </p>

          {/* Prominent Student ID reminder */}
          <div className="rounded-2xl border border-[rgba(240,150,80,0.3)] bg-gradient-to-r from-[#18130e] to-[#14100c] px-5 py-4 text-left shadow-lg">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                ID
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400">
                  Your Student ID
                </p>
                <p className="mt-1 text-sm font-medium text-[#f5f0ea] leading-snug">
                  First <span className="text-amber-400 font-bold">4 letters</span> of your name{' '}
                  +{' '}
                  Last <span className="text-amber-400 font-bold">4 digits</span> of your mobile number
                </p>
                <p className="mt-1.5 text-[11px] text-[#706860]">
                  e.g.&nbsp;
                  <span className="font-mono text-[#a39b94]">ARJUN</span>
                  &nbsp;+&nbsp;
                  <span className="font-mono text-[#a39b94]">98765<strong className="text-amber-400">3210</strong></span>
                  &nbsp;→&nbsp;
                  <span className="font-mono font-bold text-amber-400">ARJU3210</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-[rgba(255,235,215,0.06)] pt-3 text-center text-[11px] text-[#706860]">
        MVJ College of Engineering • Departmental Lecture &amp; Event Attendance System
      </footer>
    </div>
  );
}
