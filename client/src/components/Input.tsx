import React, { InputHTMLAttributes, useId } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/**
 * Text input with the label above, optional hint, error below. 16px text so
 * iOS Safari doesn't zoom on focus. Shape: rounded-lg like buttons.
 */
export function Input({ label, hint, error, className = '', id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-semibold text-gray-800 mb-1.5">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full px-3.5 py-3 text-base bg-white border rounded-lg text-gray-900 placeholder:text-gray-400 ` +
          `focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600 transition-shadow ${
          error ? 'border-red-500' : 'border-gray-300'
        } ${className}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {hint && !error && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
