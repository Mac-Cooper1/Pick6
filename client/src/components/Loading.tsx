import React from 'react';

interface LoadingProps {
  /** Inline = inside a tab panel; default = full-screen (route transitions). */
  inline?: boolean;
  label?: string;
}

function Spinner({ size }: { size: string }) {
  return (
    <div
      className={`inline-block animate-spin rounded-full border-[3px] border-green-200 border-t-green-700 ${size}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function Loading({ inline = false, label }: LoadingProps) {
  if (inline) {
    return (
      <div className="p-4 sm:p-6">
        <div className="text-center py-10">
          <Spinner size="h-8 w-8" />
          {label && <p className="mt-3 text-sm text-gray-500">{label}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-gray-100">
      <div className="text-center">
        <Spinner size="h-12 w-12" />
        <p className="mt-4 text-gray-600">{label ?? 'Loading...'}</p>
      </div>
    </div>
  );
}
