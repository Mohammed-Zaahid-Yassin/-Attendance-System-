import React from 'react';

/**
 * MvjLogo — Official MVJ College of Engineering Institutional Crest
 * Renders the provided asset with high fidelity, preserving aspect ratio
 * and ensuring crystal clarity against dark backgrounds via a sleek container.
 */
export function MvjLogo({ className = 'h-9 sm:h-10', alt = 'MVJ College of Engineering' }) {
  return (
    <img
      src="/mvj-logo.png"
      alt={alt}
      className={`${className} w-auto object-contain shrink-0 block`}
    />
  );
}

/**
 * NicLogo — Official NIC Club Logo
 */
export function NicLogo({ className = 'h-5 w-auto', alt = 'NIC Club Logo' }) {
  return (
    <img
      src="/nic-logo.png"
      alt={alt}
      className={`${className} object-contain shrink-0 block`}
    />
  );
}

/**
 * DeveloperCredit — Official Developer Attribution
 * Displays the required wording: "Developed by NIC Club, MVJCE"
 * alongside the NIC Club logo asset.
 */
export function DeveloperCredit({ className = '', compact = false }) {
  return (
    <div className={`inline-flex items-center gap-2 text-xs text-[#706860] ${className}`}>
      <NicLogo className="h-5 w-auto" />
      <span className="leading-tight">
        Developed by <strong className="text-[#a39b94] font-medium">NIC Club, MVJCE</strong>
      </span>
    </div>
  );
}

/**
 * QrNicOverlay — Centered NIC Club branding overlay for QR codes.
 *
 * Implements a pure frontend visual layer (pointer-events: none) positioned
 * at the exact geometric center of the QR code.
 *
 * Sizing & Scan Reliability:
 * - Sized at ~11.5% of the QR code dimensions (covering ~1.3% of surface area).
 * - Leaves >88% of Level M (15%) and >95% of Level H (30%) error correction capacity untouched.
 * - Leaves quiet zone and all 3 corner finder patterns completely unobstructed.
 * - Clean white backing with a subtle border ensures high contrast against black QR modules.
 * - Preserves native aspect ratio via object-contain.
 */
export function QrNicOverlay({ sizePercent = 11.5, className = '' }) {
  return (
    <div
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none z-20 flex items-center justify-center ${className}`}
      style={{
        width: `${sizePercent}%`,
        height: `${sizePercent}%`
      }}
      aria-hidden="true"
    >
      <div className="w-full h-full bg-white rounded-[18%] shadow-sm border border-neutral-300/80 flex items-center justify-center p-[6%] overflow-hidden">
        <img
          src="/nic-logo.png"
          alt="NIC Club"
          className="w-full h-full object-contain block"
          draggable={false}
        />
      </div>
    </div>
  );
}

