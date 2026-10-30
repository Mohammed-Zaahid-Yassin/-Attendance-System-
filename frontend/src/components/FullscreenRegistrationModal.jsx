import React, { useEffect, useRef } from 'react';
import { X, Maximize2, Minimize2, Copy, Check, ExternalLink } from 'lucide-react';
import { MvjLogo, NicLogo, QrNicOverlay } from './Branding';
import { copyToClipboard } from '../utils/clipboard';

export default function FullscreenRegistrationModal({
  isOpen,
  onClose,
  qrSrc,
  registrationUrl
}) {
  const modalRef = useRef(null);
  const [copied, setCopied] = React.useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = React.useState(false);

  // Handle native browser fullscreen request
  const requestBrowserFullscreen = async () => {
    try {
      if (modalRef.current && modalRef.current.requestFullscreen) {
        await modalRef.current.requestFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch (e) {
      // Browser may block non-user-gesture fullscreen; fallback modal handles it gracefully
      console.warn('Native fullscreen request declined/unavailable:', e.message);
    }
  };

  const exitBrowserFullscreen = async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch (e) {
      console.warn('Exit fullscreen error:', e.message);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    // Try engaging native fullscreen when opened
    requestBrowserFullscreen();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    // Prevent body scroll while fullscreen modal is visible
    const origOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.body.style.overflow = origOverflow;
      if (document.fullscreenElement) {
        exitBrowserFullscreen();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    exitBrowserFullscreen();
    onClose();
  };

  const handleCopy = async () => {
    if (!registrationUrl) return;
    const ok = await copyToClipboard(registrationUrl);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[100] flex flex-col justify-between bg-[#080605] text-[#f5f0ea] select-none overflow-hidden p-4 sm:p-6 md:p-8 animate-fadeIn"
      style={{ minHeight: '100vh', width: '100vw' }}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between w-full max-w-6xl mx-auto shrink-0 pb-3 border-b border-[rgba(255,235,215,0.08)]">
        <div className="flex items-center gap-3">
          <MvjLogo className="h-10 sm:h-12 w-auto" />
          <div className="hidden sm:block">
            <h1 className="font-serif text-lg sm:text-xl font-medium tracking-tight text-[#f5f0ea]">
              MVJ College of Engineering
            </h1>
            <p className="text-[11px] uppercase tracking-widest text-amber-400 font-semibold">
              Spotlight Attendance System · Student Registration
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Fallback / Native Fullscreen Toggle */}
          <button
            type="button"
            onClick={isNativeFullscreen ? exitBrowserFullscreen : requestBrowserFullscreen}
            className="flex items-center gap-1.5 rounded-full border border-[rgba(255,235,215,0.15)] bg-[#181512] px-3.5 py-2 text-xs font-semibold text-[#f5f0ea] hover:border-amber-500 hover:text-amber-400 transition"
            title="Toggle Browser Fullscreen"
          >
            {isNativeFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden md:inline">{isNativeFullscreen ? 'Window Mode' : 'Auditorium Fullscreen'}</span>
          </button>

          {/* Close / Exit Fullscreen Button */}
          <button
            type="button"
            onClick={handleClose}
            className="flex items-center gap-1.5 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 text-xs font-semibold hover:bg-red-500/30 transition shadow-lg"
          >
            <X className="h-4 w-4" />
            <span>Exit Fullscreen (Esc)</span>
          </button>
        </div>
      </div>

      {/* Main Centered QR Stage */}
      <div className="flex-1 flex flex-col items-center justify-center py-4 my-auto shrink-0">
        <div className="text-center mb-3 sm:mb-5">
          <span className="inline-block px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs uppercase tracking-widest font-semibold mb-2">
            Permanent Student Registration
          </span>
          <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-normal text-[#f5f0ea] tracking-tight">
            Scan with Any Phone Camera
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#a39b94] max-w-md mx-auto">
            Point your smartphone camera at the QR code below to register your profile for attendance.
          </p>
        </div>

        {/* Large High-Contrast Centered Square QR Container with Quiet Zone */}
        <div className="relative rounded-3xl bg-white p-5 sm:p-7 md:p-8 shadow-[0_0_80px_rgba(240,150,80,0.15)] border-4 border-amber-500/30 flex items-center justify-center shrink-0">
          <div className="relative flex items-center justify-center">
            <img
              src={qrSrc}
              alt="Official MVJCE Student Registration QR Code"
              className="w-[min(65vw,52vh,460px)] h-[min(65vw,52vh,460px)] object-contain aspect-square block"
              style={{ imageRendering: 'crisp-edges' }}
            />
            {/* Center NIC Branding Overlay */}
            <QrNicOverlay />
          </div>
        </div>

        {/* Quick URL Copy Bar */}
        {registrationUrl && (
          <div className="mt-4 sm:mt-6 flex items-center gap-2 max-w-lg w-full px-4">
            <input
              type="text"
              readOnly
              value={registrationUrl}
              className="flex-1 rounded-xl border border-[rgba(255,235,215,0.1)] bg-[#120f0d] px-3.5 py-2 text-[11px] font-mono text-[#a39b94] select-all focus:outline-none truncate"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Footer Bar */}
      <div className="flex items-center justify-between w-full max-w-6xl mx-auto shrink-0 pt-3 border-t border-[rgba(255,235,215,0.08)] text-xs text-[#706860]">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Official Roster Registration Active</span>
        </div>

        <div className="flex items-center gap-2">
          <span>Developed by NIC Club, MVJCE</span>
          <NicLogo className="h-4 w-auto" />
        </div>
      </div>
    </div>
  );
}
