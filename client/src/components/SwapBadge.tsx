import React from 'react';
import { ArrowsLeftRight } from '@phosphor-icons/react';

/**
 * Marks a team its owner added in the Week 6 Swap: any roster row that
 * starts after week 1 (drafted teams start at 1). Renders nothing for
 * drafted teams, so callers can drop it in unconditionally. Used on My Team,
 * Week by Week and League.
 */
export function SwapBadge({ fromWeek }: { fromWeek: number }) {
  if (fromWeek <= 1) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300 font-display font-semibold uppercase tracking-wider text-[10px] leading-4 whitespace-nowrap"
      title={`Added in the Week 6 Swap. Counts from week ${fromWeek}; earlier weeks stay with the team it replaced.`}
    >
      <ArrowsLeftRight size={11} weight="bold" aria-hidden />
      Week 6 Swap
    </span>
  );
}
