import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import jsQR from 'jsqr';
import { X, Camera, AlertCircle, ZoomIn, ZoomOut, Zap, ZapOff, RotateCcw } from 'lucide-react';

/**
 * QRScannerModal — dual-decoder camera QR scanner.
 *
 * Primary decoder:  html5-qrcode (ZXing) — good all-round, handles many formats.
 * Fallback decoder: jsQR — very fast, runs every frame via requestAnimationFrame,
 *                   better for low-contrast or partially-tilted codes.
 *
 * The fallback activates if the primary has been running for > 5 seconds without
 * a successful decode. Both decoders share the same camera stream.
 */
export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 5, step: 0.1 });
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hint, setHint] = useState('');

  const scannerRef = useRef(null);
  const videoTrackRef = useRef(null);
  const lastDecodeRef = useRef(null);     // debounce duplicate scans
  const fallbackRafRef = useRef(null);    // requestAnimationFrame ID
  const fallbackCanvas = useRef(null);   // off-screen canvas for jsQR
  const primaryStartTime = useRef(null); // when html5-qrcode started
  const alreadyClosedRef = useRef(false);

  // ── Extract clean token from raw decoded string ──────────────────────
  const extractToken = useCallback((raw) => {
    try {
      if (raw.includes('token=')) {
        const url = new URL(raw);
        return url.searchParams.get('token') || raw;
      }
    } catch {}
    return raw;
  }, []);

  // ── Handle a successful decode from either decoder ───────────────────
  const handleDecoded = useCallback((raw) => {
    if (alreadyClosedRef.current) return;

    const now = Date.now();
    // Debounce: ignore the same value within 2 seconds
    if (lastDecodeRef.current?.value === raw && now - lastDecodeRef.current.time < 2000) return;
    lastDecodeRef.current = { value: raw, time: now };

    alreadyClosedRef.current = true;
    const token = extractToken(raw);

    // Stop jsQR fallback loop
    if (fallbackRafRef.current) {
      cancelAnimationFrame(fallbackRafRef.current);
      fallbackRafRef.current = null;
    }

    // Stop html5-qrcode scanner
    if (scannerRef.current?.isScanning) {
      scannerRef.current.stop().catch(() => {}).finally(() => {
        onScanSuccess(token);
        onClose();
      });
    } else {
      onScanSuccess(token);
      onClose();
    }
  }, [extractToken, onScanSuccess, onClose]);

  // ── jsQR fallback — runs as rAF loop on the live video element ───────
  const startJsQrFallback = useCallback(() => {
    const canvas = fallbackCanvas.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const loop = () => {
      if (alreadyClosedRef.current) return;
      fallbackRafRef.current = requestAnimationFrame(loop);

      const video = document.querySelector('#qr-reader-container video');
      if (!video || video.readyState < 2) return;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      canvas.width = vw;
      canvas.height = vh;
      ctx.drawImage(video, 0, 0, vw, vh);

      const imageData = ctx.getImageData(0, 0, vw, vh);
      const result = jsQR(imageData.data, vw, vh, {
        inversionAttempts: 'dontInvert' // faster; most QR codes are dark on light
      });

      if (result?.data) {
        handleDecoded(result.data);
      }
    };

    fallbackRafRef.current = requestAnimationFrame(loop);
  }, [handleDecoded]);

  // ── Main effect: start/stop scanner when modal opens/closes ──────────
  useEffect(() => {
    if (!isOpen) return;

    alreadyClosedRef.current = false;
    setErrorMsg('');
    setIsStarting(true);
    setZoomLevel(1);
    setTorchOn(false);
    setHint('');
    lastDecodeRef.current = null;
    primaryStartTime.current = Date.now();

    if (!fallbackCanvas.current) {
      fallbackCanvas.current = document.createElement('canvas');
    }

    const html5QrCode = new Html5Qrcode('qr-reader-container');
    scannerRef.current = html5QrCode;

    // Larger qrbox and higher fps improve tilted/distant detection
    const qrConfig = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight);
        // Use 90% of the viewfinder — bigger box = more tolerance for tilt
        return { width: Math.floor(edge * 0.90), height: Math.floor(edge * 0.90) };
      },
      aspectRatio: 1.0,
      disableFlip: false,
      // Force higher resolution for better decode distance
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };

    html5QrCode
      .start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => handleDecoded(decodedText),
        (errorMsg) => {
          // Periodically surface a hint about distance/lighting
          const elapsed = Date.now() - (primaryStartTime.current || Date.now());
          if (elapsed > 5000 && elapsed < 5200) {
            setHint('Tip: Move the camera slightly closer or adjust the angle if the QR is not scanning.');
          }
          if (elapsed > 10000 && elapsed < 10200) {
            setHint('Still having trouble? Try turning on the torch or increasing zoom, or use the native camera app.');
          }
        }
      )
      .then(() => {
        setIsStarting(false);

        // Detect camera capabilities
        try {
          const videoElem = document.querySelector('#qr-reader-container video');
          if (videoElem?.srcObject) {
            const track = videoElem.srcObject.getVideoTracks()[0];
            if (track) {
              videoTrackRef.current = track;
              const cap = track.getCapabilities?.() ?? {};

              if (cap.zoom) {
                setHasHardwareZoom(true);
                setZoomRange({
                  min: cap.zoom.min ?? 1,
                  max: cap.zoom.max ?? 5,
                  step: cap.zoom.step ?? 0.1
                });
              }
              if (cap.torch) {
                setTorchAvailable(true);
              }
            }
          }
        } catch (capErr) {
          console.warn('[QRScanner] Capabilities:', capErr);
        }

        // Start jsQR as parallel fallback after a short delay
        // (html5-qrcode has first priority; jsQR helps with tilted/hard codes)
        setTimeout(() => {
          if (!alreadyClosedRef.current) {
            startJsQrFallback();
          }
        }, 1500);
      })
      .catch((err) => {
        setIsStarting(false);
        const msg = (err?.message || String(err)).toLowerCase();
        if (msg.includes('permission') || msg.includes('denied') || msg.includes('notallowed')) {
          setErrorMsg('Camera permission denied. Please allow camera access in your browser settings, then retry.');
        } else if (msg.includes('notfound') || msg.includes('no camera')) {
          setErrorMsg('No camera found on this device. Please use the native camera app to scan the QR code.');
        } else {
          setErrorMsg('Camera unavailable: ' + (err?.message || err));
        }
      });

    return () => {
      alreadyClosedRef.current = true;
      if (fallbackRafRef.current) {
        cancelAnimationFrame(fallbackRafRef.current);
        fallbackRafRef.current = null;
      }
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
        try { scannerRef.current.clear(); } catch {}
      }
      videoTrackRef.current = null;
    };
  }, [isOpen, handleDecoded, startJsQrFallback]);

  // ── Zoom controls ─────────────────────────────────────────────────────
  const applyZoom = (newZoom) => {
    setZoomLevel(newZoom);
    if (videoTrackRef.current && hasHardwareZoom) {
      try {
        videoTrackRef.current.applyConstraints({ advanced: [{ zoom: newZoom }] }).catch(() => {});
      } catch {}
    }
    // Digital zoom on video element (cosmetic on screen, not fed to decoder)
    const videoElem = document.querySelector('#qr-reader-container video');
    if (videoElem) {
      videoElem.style.transform = `scale(${newZoom})`;
      videoElem.style.transformOrigin = 'center center';
      videoElem.style.transition = 'transform 0.15s ease-out';
    }
  };

  // ── Torch toggle ──────────────────────────────────────────────────────
  const toggleTorch = async () => {
    if (!videoTrackRef.current || !torchAvailable) return;
    try {
      const next = !torchOn;
      await videoTrackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (e) {
      console.warn('[QRScanner] Torch toggle failed', e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-5 sm:p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-normal text-[#f5f0ea]">Scan Screen QR</h3>
              <p className="text-[10px] text-[#a39b94]">Dual-decoder • Optimized for projector screens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]"
            aria-label="Close Scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg ? (
          <div className="my-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
            <AlertCircle className="mx-auto mb-2 h-7 w-7 text-red-400" />
            <p className="text-xs font-medium text-red-300">{errorMsg}</p>
            <p className="mt-2 text-[11px] text-[#a39b94]">
              You can also open your native camera app and scan the QR code directly.
            </p>
          </div>
        ) : (
          <div>
            {/* Viewfinder */}
            <div
              id="qr-reader-container"
              className="relative overflow-hidden rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#080605]"
              style={{ minHeight: '300px', maxHeight: '360px' }}
            />

            {isStarting && (
              <p className="mt-2 text-center text-[11px] text-[#a39b94] animate-pulse">
                Initializing camera…
              </p>
            )}

            {/* Hint */}
            {hint && !isStarting && (
              <div className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-300/90 text-center leading-relaxed">
                {hint}
              </div>
            )}

            {/* Student ID Reminder */}
            <div className="mt-2.5 rounded-xl border border-amber-500/25 bg-gradient-to-r from-amber-500/10 to-amber-600/5 px-3.5 py-2 text-center text-xs text-amber-200/90 shadow-sm">
              <span className="font-semibold text-amber-400">Student ID Reminder:</span> First 4 letters of your name (CAPITALS) + last 4 digits of your mobile number (e.g., <span className="font-mono font-bold text-[#f5f0ea]">ARJU3210</span>).
            </div>

            {/* Controls Row */}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-2.5">
              {/* Zoom buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-semibold text-[#a39b94] tracking-wider mr-1">Zoom:</span>
                {[1, 1.5, 2, 2.5, 3].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => applyZoom(val)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-mono font-medium transition ${
                      Math.abs(zoomLevel - val) < 0.1
                        ? 'bg-amber-500 text-[#080605] font-bold shadow-sm'
                        : 'bg-[#120f0d] text-[#a39b94] hover:text-[#f5f0ea]'
                    }`}
                  >
                    {val}x
                  </button>
                ))}
              </div>

              {/* Torch */}
              {torchAvailable && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className={`rounded-lg p-1.5 transition ${
                    torchOn ? 'bg-amber-500/20 text-amber-400' : 'text-[#a39b94] hover:text-[#f5f0ea]'
                  }`}
                  title="Toggle Torch"
                >
                  {torchOn ? <Zap className="h-4 w-4" /> : <ZapOff className="h-4 w-4" />}
                </button>
              )}
            </div>

            <p className="mt-2 text-center text-[11px] text-[#706860]">
              Use 1.5×–2.5× zoom when seated far from the screen. The dual decoder handles slight tilts automatically.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-3 w-full rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2 text-xs font-semibold uppercase tracking-wider text-[#f5f0ea] hover:bg-[#201c18]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
