import React, { ButtonHTMLAttributes } from 'react';

/**
 * The one button. Every action in the app renders through here so padding,
 * radius, weight, disabled/pressed states and tap-target size stay consistent.
 * Colors are semantic on purpose: amber = week-5 swap, blue = commissioner
 * sync, red = destructive, nav = on the dark green navbar.
 *
 * Phones get a 44px minimum tap height (Apple HIG); from the `sm` breakpoint
 * up, buttons are compact. `hover:` only fires on devices that can hover
 * (tailwind `hoverOnlyWhenSupported`); `active:` gives tap feedback.
 */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'danger'
  | 'amber'
  | 'blue'
  | 'nav';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap ' +
  'select-none touch-manipulation transition-colors duration-150 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 focus-visible:ring-green-500',
  secondary:
    'bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400 focus-visible:ring-gray-400',
  outline:
    'bg-white border border-green-600 text-green-700 hover:bg-green-50 active:bg-green-100 focus-visible:ring-green-500',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
  amber:
    'bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800 focus-visible:ring-amber-500',
  blue:
    'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500',
  nav:
    'bg-green-700 text-white hover:bg-green-600 active:bg-green-900 focus-visible:ring-white focus-visible:ring-offset-green-800',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[2.5rem] sm:min-h-0 px-3 py-1.5 text-sm',
  md: 'min-h-[2.75rem] sm:min-h-0 px-4 py-2 text-base',
  lg: 'min-h-[2.75rem] px-6 py-3 text-base',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
