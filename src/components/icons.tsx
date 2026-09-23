// Line icons drawn in the spirit of SF Symbols.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, props: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const IconRink = ({ size = 26, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="2.5" y="5" width="19" height="14" rx="5" />
    <path d="M12 5v14" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M6 9.5v5M18 9.5v5" />
  </svg>
);

export const IconJersey = ({ size = 26, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M8.5 3.5 4 5.5 2.5 11l3 1V20.5h13V12l3-1L20 5.5l-4.5-2c-.6 1.6-1.9 2.5-3.5 2.5S9.1 5.1 8.5 3.5Z" />
    <path d="M5.5 15.5h13" />
  </svg>
);

export const IconPeople = ({ size = 26, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M16.5 14.2c2.6-.2 4.5 1.6 4.5 4.3" />
  </svg>
);

export const IconArrows = ({ size = 26, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 8h15M15 4l4 4-4 4" />
    <path d="M20 16H5M9 12l-4 4 4 4" />
  </svg>
);

export const IconTrophy = ({ size = 26, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
    <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5" />
    <path d="M12 14v3.5M8.5 20.5h7M9.5 20.5c0-1.7 1.1-3 2.5-3s2.5 1.3 2.5 3" />
  </svg>
);

export const IconChevronRight = ({ size = 14, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.6, ...p })} viewBox="0 0 14 24">
    <path d="m3 5 7 7-7 7" />
  </svg>
);

export const IconChevronLeft = ({ size = 22, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.6, ...p })} viewBox="0 0 14 24">
    <path d="m11 4-8 8 8 8" />
  </svg>
);

export const IconPlus = ({ size = 22, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.2, ...p })}>
    <path d="M12 4v16M4 12h16" />
  </svg>
);

export const IconCheck = ({ size = 18, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.6, ...p })}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconSearch = ({ size = 17, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.2, ...p })}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 5 5" />
  </svg>
);

export const IconXCircle = ({ size = 17, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...p}>
    <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.5" />
    <path d="m8.5 8.5 7 7m0-7-7 7" stroke="var(--bg-elevated)" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const IconShare = ({ size = 22, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16" />
  </svg>
);

export const IconCalendar = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const IconTicket = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M3.5 8.5V6h17v2.5a2 2 0 0 0 0 4V15h-17v-2.5a2 2 0 0 0 0-4Z" transform="translate(0 1.5)" />
    <path d="M14.5 7.5v2M14.5 12v2" />
  </svg>
);

export const IconList = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" />
  </svg>
);

export const IconSliders = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </svg>
);

export const IconStar = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" />
  </svg>
);

export const IconPerson = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20.5c0-3.9 3.6-6.5 8-6.5s8 2.6 8 6.5" />
  </svg>
);

export const IconSwap = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M7 4v16M3.5 16.5 7 20l3.5-3.5M17 20V4M13.5 7.5 17 4l3.5 3.5" />
  </svg>
);

export const IconEnvelope = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="m4 7 8 6 8-6" />
  </svg>
);

export const IconArrowCircle = ({ size = 18, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M20 12a8 8 0 1 1-2.4-5.7" />
    <path d="M20 4v4.5h-4.5" />
  </svg>
);

export const IconXmark = ({ size = 18, ...p }: P) => (
  <svg {...base(size, { strokeWidth: 2.4, ...p })}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconInfo = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6" />
    <circle cx="12" cy="7.6" r="0.6" fill="currentColor" />
  </svg>
);

export const IconTrash = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10.5v6M14 10.5v6" />
  </svg>
);

export const IconArrowUp = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16.5v-9M8 11l4-4 4 4" />
  </svg>
);

export const IconArrowDown = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v9M8 13l4 4 4-4" />
  </svg>
);

export const IconPersonPlus = ({ size = 20, ...p }: P) => (
  <svg {...base(size, p)}>
    <circle cx="10" cy="8" r="3.8" />
    <path d="M3 20c0-3.7 3.1-6.2 7-6.2 1.4 0 2.7.3 3.8.9M18.5 14v6M15.5 17h6" />
  </svg>
);
