/**
 * Inline SVG icon set. One style: 16px box, 1.5 stroke, round caps, no fills.
 * `currentColor` throughout so icons inherit the surrounding text colour.
 */
interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
});

export const IconMark = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={1.4}>
    <path d="M1.8 13.4V6.6l3.6 2.1V6.6l3.6 2.1V6.6l3.6 2.1V2.6h1.6v10.8z" />
    <path d="M1 13.4h14" />
  </svg>
);

export const IconQuestion = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M6.3 6.2a1.75 1.75 0 1 1 2.5 1.6c-.5.25-.8.6-.8 1.2v.3" />
    <path d="M8 11.6h.01" />
  </svg>
);

export const IconOrg = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="1.6" width="4" height="3.2" rx="0.5" />
    <rect x="1.6" y="11.2" width="4" height="3.2" rx="0.5" />
    <rect x="10.4" y="11.2" width="4" height="3.2" rx="0.5" />
    <path d="M8 4.8v3.4M3.6 11.2V8.2h8.8v3" />
  </svg>
);

export const IconPeople = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="6" cy="5.2" r="2.4" />
    <path d="M1.9 13.4c0-2.3 1.8-3.9 4.1-3.9s4.1 1.6 4.1 3.9" />
    <path d="M10.8 3.2a2.4 2.4 0 0 1 0 4.4M11.6 9.8c1.6.35 2.6 1.7 2.6 3.6" />
  </svg>
);

export const IconDoc = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3.4 1.8h5.2l3.6 3.6v8.8H3.4z" />
    <path d="M8.6 1.8v3.6h3.6M5.8 8.4h4.4M5.8 10.8h3" />
  </svg>
);

export const IconBadge = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="8" cy="6" r="4.2" />
    <path d="M5.4 9.6 4.4 14.2 8 12.4l3.6 1.8-1-4.6" />
  </svg>
);

export const IconHammer = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M9.1 2.4 6.4 5.1l1.3 1.3-3.9 3.9a1.2 1.2 0 0 0 0 1.7l.7.7a1.2 1.2 0 0 0 1.7 0l3.9-3.9 1.3 1.3 2.7-2.7z" />
    <path d="M11.3 4.6 8.6 1.9" />
  </svg>
);

export const IconPulse = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M1.4 8.6h3l1.6-4.8 2.4 8.4 1.7-5 1.1 2.6h3.4" />
  </svg>
);

export const IconPause = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5.6 2.8v10.4M10.4 2.8v10.4" />
  </svg>
);

export const IconPlay = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4.4 2.6 13 8l-8.6 5.4z" />
  </svg>
);

export const IconAlert = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M8 2.2 14.6 13.4H1.4z" />
    <path d="M8 6.4v3.1M8 11.6h.01" />
  </svg>
);

export const IconCheck = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M2.6 8.4 6.2 12l7.2-8" />
  </svg>
);

export const IconInbox = ({ size = 28, className }: IconProps) => (
  <svg {...base(size)} className={className} strokeWidth={1.1}>
    <path d="M1.8 9.2 3.6 2.6h8.8l1.8 6.6v4.2H1.8z" />
    <path d="M1.8 9.2h3.4l.9 1.9h3.8l.9-1.9h3.4" />
  </svg>
);
