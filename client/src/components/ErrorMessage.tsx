import React from 'react';

interface ErrorMessageProps {
  message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 border-l-4 border-l-red-600 text-red-800 px-4 py-3 rounded-lg"
    >
      <p className="text-sm"><span className="font-semibold">Something went wrong. </span>{message}</p>
    </div>
  );
}
