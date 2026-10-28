import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Maximize2,
  Minimize2,
  Tv,
  RotateCcw
} from 'lucide-react';
import { MvjLogo, DeveloperCredit, QrNicOverlay } from '../components/Branding';

/**
 * SquareCountdownTimer — Prominent square-perimeter countdown outline surrounding the QR code.
 *
 * Implements authoritative server-timestamp progress calculation:
 * - t_i: token issuance time (issuedAt)
 * - t_e: token expiration time (expiresAt)
 * - t_n: current time adjusted by server clock skew (Date.now() + serverTimeOffset)
 * - remaining = clamp((t_e - t_n) / (t_e - t_i), 0, 1)
 *
 * Visual geometry:
 * - Square path starts at top-center, proceeds clockwise: right along top → down right → left along bottom → up left → back to start.
 * - At 100% remaining, full square outline is visible.
 * - As time elapses, the visible outline depletes clockwise from the start point.
 * - No CSS transitions on stroke color — color is computed per-frame to avoid stuttering.
 *
 * Color progression (preserved from original):
 * - 100% remaining: Vibrant Spotlight Orange [249, 115, 22] (#f97316)
 * - 50% remaining: Pure Electric Yellow [250, 204, 21] (#facc15)
 * - 25% remaining: High-Contrast Warning Red [239, 68, 68] (#ef4444)
 * - 0% remaining (expired): Deep Red [220, 38, 38] (#dc2626)
 */
export function SquareCountdownTimer({ issuedAt, expiresAt, durationMs, serverTimeOffset = 0, size = 460, strokeWidth = 10, gap = 8, onExpire }) {
  const rafRef = useRef(null);
  const expiredNotifiedRef = useRef(false);

  const computeState = useCallback(() => {
    const now = Date.now() + (serverTimeOffset || 0);
    const te = expiresAt;
    const r = Math.max(0, te - now);
    const total = Math.max(1000, durationMs || (issuedAt ? te - issuedAt : 0) || Math.max(30000, r));
    const remainingFraction = Math.max(0, Math.min(1, r / total));
    return { remainingMs: r, remainingFraction };
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

  const { remainingMs, remainingFraction } = state;
  const isExpired = remainingMs <= 0;

  // Square geometry: the path sits centered in the SVG, inset by gap + half stroke
  const inset = gap + strokeWidth / 2;
  const rectSize = size - 2 * inset;
  const halfW = rectSize / 2;

  // Center of SVG
  const cx = size / 2;
  const cy = size / 2;

  // Square path starting at top-center, going clockwise:
  // M (cx, cy - halfW) → right to top-right → down to bottom-right → left to bottom-left → up to top-left → right back to start
  const x0 = cx;
  const y0 = cy - halfW;
  const pathD = [
    `M ${x0} ${y0}`,
    `L ${cx + halfW} ${cy - halfW}`,   // top-center → top-right
    `L ${cx + halfW} ${cy + halfW}`,   // top-right → bottom-right
    `L ${cx - halfW} ${cy + halfW}`,   // bottom-right → bottom-left
    `L ${cx - halfW} ${cy - halfW}`,   // bottom-left → top-left
    `Z`                                 // top-left → back to top-center (start)
  ].join(' ');

  // Total perimeter of the square
  const perimeter = 4 * rectSize;

  // Dash offset: at remainingFraction=1 (full), offset=0 (fully visible).
  // At remainingFraction=0 (expired), offset=perimeter (fully hidden).
  const dashOffset = perimeter * (1 - remainingFraction);

  // Smooth multi-step color gradient (identical thresholds & colors as original):
  let rColor, gColor, bColor;

  if (isExpired) {
    rColor = 239;
    gColor = 68;
    bColor = 68;
  } else {
    const f = remainingFraction;
    if (f >= 0.5) {
      // 100% → 50%: Orange to Yellow
      const t = (1.0 - f) / 0.5;
      rColor = Math.round(249 + (250 - 249) * t);
      gColor = Math.round(115 + (204 - 115) * t);
      bColor = Math.round(22 + (21 - 22) * t);
    } else if (f >= 0.25) {
      // 50% → 25%: Yellow to Red
      const t = (0.5 - f) / 0.25;
      rColor = Math.round(250 + (239 - 250) * t);
      gColor = Math.round(204 + (68 - 204) * t);
      bColor = Math.round(21 + (68 - 21) * t);
    } else {
      // 25% → 0%: Red to Dark Red
      const t = (0.25 - f) / 0.25;
      rColor = Math.round(239 + (220 - 239) * t);
      gColor = Math.round(68 + (38 - 68) * t);
      bColor = Math.round(68 + (38 - 68) * t);
    }
  }

  const strokeColor = `rgb(${rColor}, ${gColor}, ${bColor})`;
  const trackColor = `rgba(${rColor}, ${gColor}, ${bColor}, 0.15)`;

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
      aria-label="QR validity countdown"
    >
      {/* Background track: full square outline at low opacity */}
      <path
        d={pathD}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />

      {/* Active countdown stroke: depletes clockwise from top-center */}
      {!isExpired && (
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="miter"
          strokeDasharray={perimeter}
          strokeDashoffset={dashOffset}
          style={{
            filter: `drop-shadow(0 0 6px rgba(${rColor}, ${gColor}, ${bColor}, 0.5))`
          }}
        />
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
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [qrContainerSize, setQrContainerSize] = useState(320);

  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const qrWrapRef = useRef(null);
  const serverTimeOffsetRef = useRef(0);
  const fetchingRef = useRef(false);
  const activeTokenRef = useRef(null);

  useEffect(() => {
    activeTokenRef.current = tokenData;
  }, [tokenData]);

  // ── Measure available space for QR — maximize QR size without scrolling ────────────────
  // The square countdown outline uses OUTLINE_STROKE=10 and OUTLINE_GAP=8.
  // Overhead is kept minimal so almost all viewport is dedicated to the QR code.
  const OUTLINE_STROKE = 10;
  const OUTLINE_GAP = 8;
  const OUTLINE_OVERHEAD = 2 * (OUTLINE_GAP * 2 + OUTLINE_STROKE); // 52px total

  const measure = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isWidescreen = vw >= 1024;

    const headerH = headerRef.current ? headerRef.current.offsetHeight : 62;
    const footerH = footerRef.current ? footerRef.current.offsetHeight : 32;

    let maxQr;

    if (isWidescreen) {
      // Side-by-side layout:
      // Side panel takes ~350px + gap (~36px) + outer padding (~48px) + buffer (16px) ≈ 450px
      // Vertical space: header + footer + container py (24px) + main py (8px) + safety buffer (16px) ≈ 48px + header + footer
      const availableW = Math.max(240, vw - 450);
      const verticalOverhead = headerH + footerH + 48;
      const availableH = Math.max(240, vh - verticalOverhead);

      // QR can be up to the smaller of available width/height, minus outline overhead
      maxQr = Math.min(availableW, availableH) - OUTLINE_OVERHEAD;
      // Cap at 850px to ensure comfortable clearance on 1080p auditorium screens
      maxQr = Math.min(maxQr, 850);
    } else {
      // Stacked layout for mobile / tablet portrait
      const availableW = vw * 0.90;
      const verticalOverhead = headerH + footerH + 340; // account for side panel below QR
      const availableH = Math.max(180, vh - verticalOverhead);
      maxQr = Math.min(availableW, availableH) - OUTLINE_OVERHEAD;
      maxQr = Math.min(maxQr, 420);
    }

    setQrContainerSize(Math.floor(Math.max(180, maxQr)));
  }, [OUTLINE_OVERHEAD]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // ── Fullscreen change listener ─────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(measure, 50);
      setTimeout(measure, 150);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [measure]);

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
      const res = await axios.get(`/api/token/qr/${selectedSessionId}?origin=${originParam}`);
      const data = res.data;
      if (data && data.server_time) {
        serverTimeOffsetRef.current = data.server_time - Date.now();
      }

      // Guard: reject stale response older than currently displayed token (dynamic mode only)
      const current = activeTokenRef.current;
      const isDynamic = !data.static_qr_mode && !data.is_static && !current?.static_qr_mode && !current?.is_static;
      if (current && data.expires_at < current.expires_at && isDynamic) {
        return;
      }

      // If token payload and mode have not changed, do NOT re-trigger state
      const isNewStatic = Boolean(data.static_qr_mode || data.is_static);
      const isCurrentStatic = Boolean(current?.static_qr_mode || current?.is_static);
      if (current && data.token === current.token && isNewStatic === isCurrentStatic) {
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
      <div className="flex h-screen h-[100dvh] max-h-screen overflow-hidden flex-col items-center justify-center bg-[#080605] p-6 text-center text-[#f5f0ea]">
        <div className="max-w-md w-full rounded-2xl border border-[rgba(255,235,215,0.08)] bg-[#120f0d] p-8 shadow-2xl flex flex-col items-center">
          <MvjLogo className="h-12 w-auto mb-4" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-500">
            MVJ College of Engineering
          </p>
          <h2 className="mt-1 font-serif text-2xl font-normal text-[#f5f0ea]">
            Auditorium Projector Standby
          </h2>
          <p className="mt-3 text-xs leading-relaxed text-[#a39b94]">
            No lecture or event session is currently active.
          </p>
          <div className="mt-6 w-full rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#181512] p-4 text-[11px] text-[#706860]">
            Display auto-refreshes every 5 seconds.
          </div>
          <div className="mt-6 pt-4 border-t border-[rgba(255,235,215,0.06)] w-full flex justify-center">
            <DeveloperCredit />
          </div>
        </div>
      </div>
    );
  }

  const isPinRequired = tokenData?.pin_required !== false;
  const isStaticQr = Boolean(
    Number(currentSession?.static_qr_mode) === 1 ||
    currentSession?.static_qr_mode === true ||
    currentSession?.static_qr_mode === '1' ||
    Number(tokenData?.static_qr_mode) === 1 ||
    tokenData?.static_qr_mode === true ||
    tokenData?.static_qr_mode === '1' ||
    tokenData?.is_static === true
  );

  // The outline SVG size = QR + outline overhead
  const outlineSvgSize = qrContainerSize + OUTLINE_OVERHEAD;

  return (
    <div className="flex h-screen h-[100dvh] max-h-screen overflow-hidden flex-col justify-between bg-[#080605] text-[#f5f0ea] p-3 sm:px-6 sm:py-3.5 select-none box-border">
      {/* Top Bar */}
      <header
        ref={headerRef}
        className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(255,235,215,0.08)] pb-2.5 sm:pb-3 shrink-0"
      >
        <div className="flex items-center gap-3.5">
          <MvjLogo className="h-8 sm:h-9" />
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

      {/* Main Display: Responsive side-by-side on projector/widescreen, stacked on mobile */}
      <main className="flex flex-1 min-h-0 flex-col lg:flex-row items-center justify-center gap-6 lg:gap-10 py-1 px-2 w-full max-w-[1600px] mx-auto overflow-hidden">
        {/* QR Code + Square Countdown Outline */}
        <div className="flex flex-col items-center justify-center shrink-0">
          <div
            ref={qrWrapRef}
            className="relative flex items-center justify-center"
            style={{ width: outlineSvgSize, height: outlineSvgSize }}
          >
            {/* Square countdown SVG surrounding the QR code */}
            {!isStaticQr && tokenData?.expires_at && (
              <SquareCountdownTimer
                key={tokenData.token}
                issuedAt={tokenData.issued_at}
                expiresAt={tokenData.expires_at}
                durationMs={tokenData.duration_ms}
                serverTimeOffset={serverTimeOffsetRef.current}
                size={outlineSvgSize}
                strokeWidth={OUTLINE_STROKE}
                gap={OUTLINE_GAP}
                onExpire={handleTokenExpire}
              />
            )}

            {/* Static QR mode: prominent green square status outline instead */}
            {isStaticQr && (
              <div
                className="absolute border-[5px] border-emerald-500/50 animate-pulse pointer-events-none"
                style={{
                  width: qrContainerSize + 2 * (OUTLINE_GAP + OUTLINE_STROKE / 2),
                  height: qrContainerSize + 2 * (OUTLINE_GAP + OUTLINE_STROKE / 2),
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)'
                }}
              />
            )}

            {/* QR Image card — sharp square corners for maximum scan clarity */}
            <div
              className="relative z-10 bg-white shadow-2xl overflow-hidden"
              style={{
                width: qrContainerSize,
                height: qrContainerSize,
                padding: Math.floor(qrContainerSize * 0.02),
                borderRadius: 0
              }}
            >
              {tokenData?.qr_code ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={tokenData.qr_code}
                    alt="Attendance QR Code"
                    className="h-full w-full object-contain block"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  <QrNicOverlay />
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#181512]">
                  <RotateCcw className="h-10 w-10 animate-spin text-amber-400" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel: Screen PIN, Student ID Reminder & Instructions (always visible in fullscreen) */}
        <div className="flex flex-col w-full max-w-sm sm:max-w-md lg:w-[340px] space-y-2.5 sm:space-y-3 shrink-0 justify-center">
          {/* Screen PIN (if required) */}
          {isPinRequired && (
            <div className="rounded-2xl border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-5 py-3 text-center shadow-xl">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a39b94]">
                Screen PIN
              </span>
              <div className="mt-0.5 font-mono text-4xl sm:text-5xl lg:text-6xl font-black tracking-[0.16em] text-amber-400">
                {tokenData?.unique_pin || '••••••'}
              </div>
            </div>
          )}

          {/* Static QR mode badge */}
          {isStaticQr && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-center text-xs text-emerald-400 font-medium">
              <span className="relative flex items-center justify-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Static QR Mode — Active
              </span>
            </div>
          )}

          {/* Prominent Student ID reminder */}
          <div className="rounded-2xl border border-[rgba(240,150,80,0.35)] bg-gradient-to-br from-[#1a140f] via-[#14100c] to-[#18130e] p-3.5 sm:p-4 shadow-2xl text-left">
            <div className="flex items-center gap-2.5 pb-2 border-b border-[rgba(255,235,215,0.08)]">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 text-xs font-bold ring-1 ring-amber-500/30">
                ID
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-400">
                  Student ID Format
                </p>
                <p className="text-[10px] text-[#8e857d]">Required during scan verification</p>
              </div>
            </div>

            <div className="mt-2.5 space-y-1.5">
              <div className="flex items-center justify-between rounded-xl bg-[#0e0c0a] border border-[rgba(255,235,215,0.06)] px-3 py-1">
                <span className="text-xs text-[#a39b94]">Name Prefix</span>
                <span className="text-xs font-bold text-amber-400 font-mono tracking-wide">First 4 Letters</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#0e0c0a] border border-[rgba(255,235,215,0.06)] px-3 py-1">
                <span className="text-xs text-[#a39b94]">Mobile Suffix</span>
                <span className="text-xs font-bold text-amber-400 font-mono tracking-wide">Last 4 Digits</span>
              </div>
            </div>

            {/* Concrete Example */}
            <div className="mt-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[#a39b94] font-medium">Example</div>
              <div className="mt-0.5 flex items-center justify-between text-xs">
                <span className="text-[#c8c0b8] font-mono"><strong className="text-white">ARJU</strong>N + 98765<strong className="text-white">3210</strong></span>
                <span className="text-amber-400 font-mono font-black text-sm tracking-wider">ARJU3210</span>
              </div>
            </div>
          </div>

          {/* Quick scan instruction */}
          <div className="rounded-xl border border-[rgba(255,235,215,0.06)] bg-[#120f0d]/60 px-4 py-1.5 text-center text-xs text-[#8e857d]">
            Scan with your mobile camera
            {isPinRequired ? ' & enter the screen PIN' : ''} to mark attendance.
          </div>
        </div>
      </main>

      <footer
        ref={footerRef}
        className="border-t border-[rgba(255,235,215,0.06)] pt-2 pb-0.5 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-[#706860]"
      >
        <span>MVJ College of Engineering • Departmental Lecture &amp; Event Attendance System</span>
        <DeveloperCredit className="text-[11px]" />
      </footer>
    </div>
  );
}
