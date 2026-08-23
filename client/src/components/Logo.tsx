import React from 'react';

/**
 * The Pick 6 mark + wordmark. Same geometry as public/favicon.svg (deep-green
 * tile, bold 6, gold goal line) so the tab icon, home-screen icon and in-app
 * logo all read as one brand.
 */

interface MarkProps {
  className?: string;
  /** On the deep-green header the tile flips to white so it stays visible. */
  inverted?: boolean;
}

export function Mark({ className = 'w-8 h-8', inverted = false }: MarkProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" className={inverted ? 'fill-white' : 'fill-green-900'} />
      <text
        x="32"
        y="47"
        textAnchor="middle"
        fontSize="46"
        fontWeight="800"
        className={`font-display ${inverted ? 'fill-green-900' : 'fill-white'}`}
      >
        6
      </text>
      <rect x="16" y="52" width="32" height="4" rx="2" className="fill-amber-400" />
    </svg>
  );
}

interface LogoProps {
  /** 'dark' = on the green header (white wordmark), 'light' = on white. */
  tone?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { mark: 'w-7 h-7', word: 'text-xl' },
  md: { mark: 'w-8 h-8 sm:w-9 sm:h-9', word: 'text-2xl sm:text-[1.75rem]' },
  lg: { mark: 'w-12 h-12 sm:w-14 sm:h-14', word: 'text-4xl sm:text-5xl' },
};

export function Logo({ tone = 'dark', size = 'md', className = '' }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center gap-2 sm:gap-2.5 ${className}`}>
      <Mark className={`${s.mark} shrink-0`} inverted={tone === 'dark'} />
      <span
        className={`font-display font-extrabold uppercase tracking-wide leading-none ${s.word} ${
          tone === 'dark' ? 'text-white' : 'text-green-900'
        }`}
      >
        Pick&nbsp;6
      </span>
    </span>
  );
}
