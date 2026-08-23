/**
 * Leaderboard — the default tab. One cumulative table, no head-to-head.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { standingsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';

interface LeaderboardTabProps {
  leagueId: number;
}

/** Rank medallion: gold / silver / bronze for the podium, plain numeral after. */
export function RankBadge({ rank }: { rank: number }) {
  const podium: Record<number, string> = {
    1: 'bg-amber-400 text-amber-950 ring-amber-500/40',
    2: 'bg-gray-300 text-gray-800 ring-gray-400/40',
    3: 'bg-orange-300 text-orange-950 ring-orange-400/40',
  };
  const style = podium[rank];
  return (
    <span
      className={`inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full font-display font-bold text-lg leading-none ${
        style ? `${style} ring-2` : 'text-gray-500'
      }`}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </span>
  );
}

export const SCORING = [
  { pts: '+1', title: 'Win', body: 'As the favorite, a small underdog, or with no line.', tone: 'bg-green-50 border-green-200 text-green-800' },
  { pts: '+2', title: 'Upset win', body: 'Win as an underdog of +3.5 or more.', tone: 'bg-green-700 border-green-700 text-white' },
  { pts: '0', title: 'Loss', body: 'Any loss inside the window or with no line.', tone: 'bg-gray-50 border-gray-200 text-gray-700' },
  { pts: '−1', title: 'Bust', body: 'Lose as a favorite of −3.5 or more.', tone: 'bg-red-50 border-red-200 text-red-800' },
];

export function LeaderboardTab({ leagueId }: LeaderboardTabProps) {
  const { user } = useAuth();

  const { data: standings, isLoading, error } = useQuery({
    queryKey: ['overallStandings', leagueId],
    queryFn: () => standingsApi.getOverallStandings(leagueId),
    refetchInterval: 10000,
  });

  if (isLoading) return <Loading inline />;

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage message="Failed to load the leaderboard" />
      </div>
    );
  }

  const leader = standings?.[0];

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">
        <div>
          <div className="flex items-end justify-between gap-4 mb-3 sm:mb-4">
            <div>
              <h2 className="section-title">Leaderboard</h2>
              <p className="section-sub">Cumulative points, all season</p>
            </div>
            {leader && leader.points > 0 && (
              <p className="text-right text-sm text-gray-500 hidden sm:block">
                <span className="label block">Leader</span>
                <span className="font-semibold text-gray-800">{leader.user.name}</span>
              </p>
            )}
          </div>

          <div className="card overflow-hidden">
            {standings && standings.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="label text-left pl-4 sm:pl-5 pr-2 py-3 w-14 sm:w-16">Rank</th>
                    <th className="label text-left px-2 py-3">Player</th>
                    <th className="label text-right pl-2 pr-4 sm:pr-5 py-3">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing) => {
                    const me = standing.user.id === user?.id;
                    const first = standing.rank === 1;
                    return (
                      <tr
                        key={standing.user.id}
                        className={`border-b border-gray-100 last:border-b-0 transition-colors hover:bg-gray-50 ${
                          me ? 'bg-green-50 hover:bg-green-50' : ''
                        }`}
                      >
                        <td className="pl-4 sm:pl-5 pr-2 py-2.5 sm:py-3">
                          <RankBadge rank={standing.rank} />
                        </td>
                        <td className="px-2 py-2.5 sm:py-3">
                          <span className={`text-base sm:text-lg ${first ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                            {standing.user.name}
                          </span>
                          {me && <span className="label ml-2 text-green-700">You</span>}
                        </td>
                        <td className="pl-2 pr-4 sm:pr-5 py-2.5 sm:py-3 text-right">
                          <span className={`font-display font-bold text-2xl sm:text-3xl leading-none ${
                            standing.points > 0 ? 'text-green-700' : standing.points < 0 ? 'text-red-600' : 'text-gray-500'
                          }`}>
                            {standing.points}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 text-center py-10 px-4">No scores yet this season</p>
            )}
          </div>
        </div>

        {/* Scoring legend: four outcomes, four tinted tiles */}
        <div>
          <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900 mb-3">
            Scoring, per team per week
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SCORING.map((s) => (
              <div key={s.title} className={`rounded-xl border p-3 sm:p-4 ${s.tone}`}>
                <div className="font-display font-extrabold text-3xl sm:text-4xl leading-none">{s.pts}</div>
                <div className="font-semibold mt-2">{s.title}</div>
                <div className="text-xs mt-0.5 opacity-80 leading-snug">{s.body}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Each team scores exactly one of these per week: an upset win is 2 points total (not 1&nbsp;+&nbsp;2),
            and a bust is &minus;1 total.
          </p>
        </div>
      </div>
    </div>
  );
}
