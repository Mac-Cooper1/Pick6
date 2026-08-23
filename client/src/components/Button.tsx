import React, { ButtonHTMLAttributes } from 'react';

/**
 * The one button. Every action in the app renders through here so padding,
 * radius, weight, disabled/pressed states and tap-target size stay consistent.
 * Colors are semantic on purpose: amber = week-5 swap, blue = commissioner
 * sync, red = destructive, nav = on the dark green header.
 *
 * Shape system: buttons are rounded-lg (8px), same as inputs; cards are
 * rounded-xl; chips are pills. Pressing nudges the button down 1px.
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
  'select-none touch-manipulation transition-[background-color,color,transform,box-shadow] duration-150 ' +
  'active:translate-y-px ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-green-700 text-white shadow-sm hover:bg-green-800 active:bg-green-900 focus-visible:ring-green-600',
  secondary:
    'bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400 focus-visible:ring-gray-400',
  outline:
    'bg-white border border-green-700 text-green-800 hover:bg-green-50 active:bg-green-100 focus-visible:ring-green-600',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500',
  amber:
    'bg-amber-500 text-gray-950 shadow-sm hover:bg-amber-400 active:bg-amber-600 focus-visible:ring-amber-500',
  blue:
    'bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 focus-visible:ring-blue-500',
  nav:
    'bg-white/10 text-white border border-white/15 hover:bg-white/20 active:bg-white/5 focus-visible:ring-white focus-visible:ring-offset-green-900',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[2.5rem] sm:min-h-0 px-3 py-1.5 text-sm',
  md: 'min-h-[2.75rem] sm:min-h-0 px-4 py-2 text-base',
  lg: 'min-h-[3rem] px-6 py-3 text-base',
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
