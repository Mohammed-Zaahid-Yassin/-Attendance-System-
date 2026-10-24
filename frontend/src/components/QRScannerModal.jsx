import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle, ZoomIn, ZoomOut, Zap, ZapOff } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hasHardwareZoom, setHasHardwareZoom] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 3, step: 0.1 });
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const scannerRef = useRef(null);
  const videoTrackRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setIsStarting(true);
    setZoomLevel(1);
    setTorchOn(false);

    const html5QrCode = new Html5Qrcode('qr-reader-container');
    scannerRef.current = html5QrCode;

    const qrConfig = {
      fps: 15,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const edge = Math.min(viewfinderWidth, viewfinderHeight);
        return {
          width: Math.floor(edge * 0.85),
          height: Math.floor(edge * 0.85)
        };
      },
      aspectRatio: 1.0,
      disableFlip: false
    };

    html5QrCode
      .start(
        { facingMode: 'environment' },
        qrConfig,
        (decodedText) => {
          try {
            let token = decodedText;
            if (decodedText.includes('token=')) {
              const url = new URL(decodedText);
              token = url.searchParams.get('token') || decodedText;
            }
            if (scannerRef.current && scannerRef.current.isScanning) {
              scannerRef.current.stop().then(() => {
                onScanSuccess(token);
                onClose();
              }).catch(() => {
                onScanSuccess(token);
                onClose();
              });
            } else {
              onScanSuccess(token);
              onClose();
            }
          } catch {
            onScanSuccess(decodedText);
            onClose();
          }
        },
        () => {}
      )
      .then(() => {
        setIsStarting(false);

        // Detect camera track capabilities (hardware zoom & torch)
        try {
          const videoElem = document.querySelector('#qr-reader-container video');
          if (videoElem && videoElem.srcObject) {
            const stream = videoElem.srcObject;
            const track = stream.getVideoTracks()[0];
            if (track) {
              videoTrackRef.current = track;
              const capabilities = track.getCapabilities ? track.getCapabilities() : {};

              if (capabilities.zoom) {
                setHasHardwareZoom(true);
                setZoomRange({
                  min: capabilities.zoom.min || 1,
                  max: capabilities.zoom.max || 5,
                  step: capabilities.zoom.step || 0.1
                });
              }

              if (capabilities.torch) {
                setTorchAvailable(true);
              }
            }
          }
        } catch (capErr) {
          console.warn('[QRScanner] Capabilities error:', capErr);
        }
      })
      .catch((err) => {
        setIsStarting(false);
        setErrorMsg('Camera access denied or unavailable: ' + (err.message || err));
      });

    return () => {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          scannerRef.current.stop().catch(() => {});
        }
        try {
          scannerRef.current.clear();
        } catch {}
      }
      videoTrackRef.current = null;
    };
  }, [isOpen]);

  // Apply zoom (hardware if supported, digital CSS transform fallback)
  const applyZoom = (newZoom) => {
    setZoomLevel(newZoom);

    // Hardware zoom
    if (videoTrackRef.current && hasHardwareZoom) {
      try {
        videoTrackRef.current.applyConstraints({
          advanced: [{ zoom: newZoom }]
        }).catch(() => {});
      } catch {}
    }

    // Digital software zoom fallback on video element
    const videoElem = document.querySelector('#qr-reader-container video');
    if (videoElem) {
      videoElem.style.transform = `scale(${newZoom})`;
      videoElem.style.transformOrigin = 'center center';
      videoElem.style.transition = 'transform 0.15s ease-out';
    }
  };

  // Toggle torch / flash
  const toggleTorch = async () => {
    if (!videoTrackRef.current || !torchAvailable) return;
    try {
      const nextState = !torchOn;
      await videoTrackRef.current.applyConstraints({
        advanced: [{ torch: nextState }]
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('[QRScanner] Failed to toggle torch', e);
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
              <h3 className="font-serif text-lg font-normal text-[#f5f0ea]">
                Scan Screen QR
              </h3>
              <p className="text-[10px] text-[#a39b94]">Optimized for auditorium projection screens</p>
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
              You can also open your smartphone's default camera app to scan the QR code.
            </p>
          </div>
        ) : (
          <div>
            {/* Viewfinder Container */}
            <div
              id="qr-reader-container"
              className="relative overflow-hidden rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#080605]"
              style={{ minHeight: '280px', maxHeight: '340px' }}
            ></div>

            {isStarting && (
              <p className="mt-2 text-center text-[11px] text-[#a39b94] animate-pulse">
                Initializing camera feed...
              </p>
            )}

            {/* Zoom Controls Bar */}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-[rgba(255,235,215,0.08)] bg-[#181512] p-2.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-semibold text-[#a39b94] tracking-wider mr-1">
                  Zoom:
                </span>
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

              {/* Torch button if available */}
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
              Use 1.5x - 2.5x zoom if seated far from the auditorium projector screen.
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
