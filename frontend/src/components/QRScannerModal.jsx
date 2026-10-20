import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, Camera, AlertCircle } from 'lucide-react';

export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setIsStarting(true);
    const html5QrCode = new Html5Qrcode('qr-reader-container');
    scannerRef.current = html5QrCode;

    const qrConfig = { fps: 10, qrbox: { width: 250, height: 250 } };

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
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border border-[rgba(240,150,80,0.3)] bg-[#120f0d] p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-[rgba(255,235,215,0.08)] pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <Camera className="h-5 w-5" />
            </div>
            <h3 className="font-serif text-lg font-normal text-[#f5f0ea]">
              Scan Screen QR
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[#a39b94] hover:bg-[#181512] hover:text-[#f5f0ea]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMsg ? (
          <div className="my-4 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
            <AlertCircle className="mx-auto mb-2 h-7 w-7 text-red-400" />
            <p className="text-xs font-medium text-red-300">{errorMsg}</p>
            <p className="mt-2 text-[11px] text-[#a39b94]">
              You can also open your smartphone's built-in camera app to scan the QR code.
            </p>
          </div>
        ) : (
          <div>
            <div
              id="qr-reader-container"
              className="overflow-hidden rounded-xl border border-[rgba(255,235,215,0.12)] bg-[#080605]"
              style={{ minHeight: '280px' }}
            ></div>
            {isStarting && (
              <p className="mt-3 text-center text-[11px] text-[#a39b94] animate-pulse">
                Initializing camera feed...
              </p>
            )}
            <p className="mt-3 text-center text-[11px] text-[#706860]">
              Align camera with the dynamic QR code displayed on the auditorium projector screen.
            </p>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-full border border-[rgba(255,235,215,0.12)] bg-[#181512] py-2.5 text-xs font-semibold uppercase tracking-wider text-[#f5f0ea] hover:bg-[#201c18]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
