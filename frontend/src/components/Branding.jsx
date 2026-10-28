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

export const NIC_TEAM_URL = 'https://nicmvjce.pages.dev/team';

/**
 * NicLogo — Official NIC Club Logo
 * Hyperlinked to the official NIC Team directory: https://nicmvjce.pages.dev/team
 */
export function NicLogo({ className = 'h-5 w-auto', alt = 'NIC Club Logo' }) {
  return (
    <a
      href={NIC_TEAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center transition hover:opacity-80 active:scale-95 shrink-0"
      title="NIC Club Team — MVJCE"
      aria-label="Visit NIC Club Team page"
    >
      <img
        src="/nic-logo.png"
        alt={alt}
        className={`${className} object-contain shrink-0 block`}
      />
    </a>
  );
}

/**
 * DeveloperCredit — Official Developer Attribution
 * Displays the required wording: "Developed by NIC Club, MVJCE"
 * alongside the NIC Club logo asset, with hyperlinks to the NIC team page.
 */
export function DeveloperCredit({ className = '', compact = false }) {
  return (
    <div className={`inline-flex items-center gap-2 text-xs text-[#706860] ${className}`}>
      <NicLogo className="h-5 w-auto" />
      <span className="leading-tight">
        Developed by{' '}
        <a
          href={NIC_TEAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#a39b94] font-medium hover:text-amber-400 hover:underline transition"
          title="NIC Club Team — MVJCE"
        >
          NIC Club, MVJCE
        </a>
      </span>
    </div>
  );
}

/**
 * QrNicOverlay — Centered NIC Club branding overlay for QR codes.
 *
 * Implements a centered visual branding layer with a direct link to
 * the official NIC Club Team directory (https://nicmvjce.pages.dev/team).
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
      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none z-20 flex items-center justify-center ${className}`}
      style={{
        width: `${sizePercent}%`,
        height: `${sizePercent}%`
      }}
    >
      <a
        href={NIC_TEAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="NIC Club Team — MVJCE (Click to view team)"
        aria-label="Visit NIC Club Team page"
        className="w-full h-full bg-white rounded-[18%] shadow-sm border border-neutral-300/80 flex items-center justify-center p-[6%] overflow-hidden transition hover:scale-105 active:scale-95 cursor-pointer pointer-events-auto"
      >
        <img
          src="/nic-logo.png"
          alt="NIC Club"
          className="w-full h-full object-contain block"
          draggable={false}
        />
      </a>
    </div>
  );
}

