/* Shared SVG icon components — import from here, not inline per-file. */

export function IcRefresh({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd"/>
    </svg>
  )
}

export function IcSearch({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width={size} height={size}>
      <circle cx="6.5" cy="6.5" r="4.5"/>
      <path d="M10 10l3 3"/>
    </svg>
  )
}

export function IcPhone({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"/>
    </svg>
  )
}

export function IcEmailIcon({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z"/>
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z"/>
    </svg>
  )
}

export function IcTrash({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M2 4h12M5 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M6 7v5M10 7v5M3 4l.8 9.5a.5.5 0 0 0 .5.5h7.4a.5.5 0 0 0 .5-.5L13 4"/>
    </svg>
  )
}

export function IcPlus({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width={size} height={size}>
      <path d="M8 2v12M2 8h12"/>
    </svg>
  )
}

export function IcClose({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width={size} height={size}>
      <path d="M3 3l10 10M13 3L3 13"/>
    </svg>
  )
}

export function IcChevron({ open, size = 14 }: { open: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>
      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/>
    </svg>
  )
}

export function IcWeb({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M2 12h20"/>
      <path d="M12 3c-2.5 2.8-4 5.8-4 9s1.5 6.2 4 9"/>
      <path d="M12 3c2.5 2.8 4 5.8 4 9s-1.5 6.2-4 9"/>
    </svg>
  )
}

export function IcDashboard({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path d="M2 3a1 1 0 011-1h5a1 1 0 011 1v6a1 1 0 01-1 1H3a1 1 0 01-1-1V3zm9 0a1 1 0 011-1h5a1 1 0 011 1v2a1 1 0 01-1 1h-5a1 1 0 01-1-1V3zm0 6a1 1 0 011-1h5a1 1 0 011 1v8a1 1 0 01-1 1h-5a1 1 0 01-1-1V9zM2 13a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4z"/>
    </svg>
  )
}

export function IcUsers({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
    </svg>
  )
}

export function IcKey({ size = 17 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd"/>
    </svg>
  )
}

export function IcBook({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M10 4.5C10 4.5 8.5 3 5.5 3S2 4 2 4v11s1.5-1 3.5-1 4.5 1.5 4.5 1.5m0-12v12m0-12s1.5-1.5 4.5-1.5S18 4 18 4v11s-1-1-3.5-1-4.5 1.5-4.5 1.5"/>
    </svg>
  )
}

export function IcUpload({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M10 13V3m0 0L6 7m4-4l4 4M3 15v1a1 1 0 001 1h12a1 1 0 001-1v-1"/>
    </svg>
  )
}

export function IcChat({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M4 4h12a1.5 1.5 0 011.5 1.5v7A1.5 1.5 0 0116 14H8l-4 3v-3H4a1.5 1.5 0 01-1.5-1.5v-7A1.5 1.5 0 014 4z"/>
      <path d="M7 8.5h6M7 11h4"/>
    </svg>
  )
}

export function IcChart({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M3 3v13a1 1 0 001 1h13"/>
      <path d="M6.5 12l3-3.5 2.5 2 3.5-4.5"/>
    </svg>
  )
}

export function IcSparkles({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M10 3l1.6 3.8L15.5 8l-3.9 1.2L10 13l-1.6-3.8L4.5 8l3.9-1.2z"/>
      <path d="M15.5 12.5l.7 1.6 1.6.6-1.6.6-.7 1.7-.7-1.7-1.6-.6 1.6-.6z"/>
    </svg>
  )
}

export function IcStar({ size = 14, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" width={size} height={size}>
      <path d="M10 2.5l2.3 4.7 5.2.75-3.75 3.66.9 5.14L10 14.9l-4.65 2.45.9-5.14L2.5 7.95l5.2-.75z"/>
    </svg>
  )
}

export function IcTicket({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M3 6.5A1.5 1.5 0 014.5 5h11A1.5 1.5 0 0117 6.5V8a1.5 1.5 0 000 3v1.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 12.5V11a1.5 1.5 0 000-3V6.5z"/>
      <path d="M11 5v10" strokeDasharray="1.5 2"/>
    </svg>
  )
}

export function IcHeadset({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M4 11v-1a6 6 0 0112 0v1"/>
      <rect x="2.5" y="11" width="3.5" height="5" rx="1.2"/>
      <rect x="14" y="11" width="3.5" height="5" rx="1.2"/>
      <path d="M16 16v.5a2.5 2.5 0 01-2.5 2.5H10"/>
    </svg>
  )
}

export function IcSend({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M17 3L9 11M17 3l-5 14-3-6-6-3 14-5z"/>
    </svg>
  )
}

export function IcUnlock({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <rect x="4" y="9" width="12" height="8" rx="1.5"/>
      <path d="M7 9V6a3 3 0 015.9-.8"/>
    </svg>
  )
}

export function IcCheckCircle({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" width={size} height={size}>
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
    </svg>
  )
}
