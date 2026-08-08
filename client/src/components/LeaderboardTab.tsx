/**
 * Leaderboard — the default tab. One cumulative table, no head-to-head.
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { standingsApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage } from './ErrorMessage';

interface LeaderboardTabProps {
  leagueId: number;
}

export function LeaderboardTab({ leagueId }: LeaderboardTabProps) {
  const { user } = useAuth();

  const { data: standings, isLoading, error } = useQuery({
    queryKey: ['overallStandings', leagueId],
    queryFn: () => standingsApi.getOverallStandings(leagueId),
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <ErrorMessage message="Failed to load the leaderboard" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-green-700 text-white p-4">
            <h2 className="text-2xl font-bold">Leaderboard</h2>
            <p className="text-green-100 text-sm">Cumulative points, all season</p>
          </div>

          <div className="p-4">
            {standings && standings.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-semibold text-gray-700 w-16">Rank</th>
                    <th className="p-2 font-semibold text-gray-700">Player</th>
                    <th className="p-2 text-right font-semibold text-gray-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing) => (
                    <tr
                      key={standing.user.id}
                      className={`border-b last:border-b-0 hover:bg-gray-50 ${
                        standing.user.id === user?.id ? 'bg-green-50' : ''
                      }`}
                    >
                      <td className="p-2">
                        {standing.rank === 1 && <span className="text-2xl">🏆</span>}
                        {standing.rank === 2 && <span className="text-2xl">🥈</span>}
                        {standing.rank === 3 && <span className="text-2xl">🥉</span>}
                        {standing.rank > 3 && (
                          <span className="font-bold text-gray-800 pl-2">{standing.rank}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={standing.rank === 1 ? 'font-bold' : ''}>
                          {standing.user.name}
                          {standing.user.id === user?.id && (
                            <span className="text-green-600 text-xs ml-1">(You)</span>
                          )}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold text-green-700 text-lg">
                        {standing.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 text-center py-6">No scores yet this season</p>
            )}
          </div>
        </div>

        {/* Scoring Legend */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="font-bold text-gray-800 mb-3">Scoring — per team, per week</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="font-semibold text-green-600">+1 point</div>
              <div className="text-gray-600">Win (favorite, small underdog, or no line)</div>
            </div>
            <div>
              <div className="font-semibold text-green-700">+2 points</div>
              <div className="text-gray-600">Win as a +3.5-or-more underdog</div>
            </div>
            <div>
              <div className="font-semibold text-gray-600">0 points</div>
              <div className="text-gray-600">Loss</div>
            </div>
            <div>
              <div className="font-semibold text-red-600">−1 point</div>
              <div className="text-gray-600">Loss as a −3.5-or-more favorite</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Each team scores exactly one of these per week — an upset win is 2 points total
            (not 1&nbsp;+&nbsp;2), and an upset loss is −1 total.
          </p>
        </div>
      </div>
    </div>
  );
}
