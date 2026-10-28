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
