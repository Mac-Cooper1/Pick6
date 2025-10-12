import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { standingsApi } from '../services/api';
import { ErrorMessage } from './ErrorMessage';

interface StandingsTabProps {
  leagueId: number;
}

export function StandingsTab({ leagueId }: StandingsTabProps) {
  const [currentWeek, setCurrentWeek] = useState(5); // Default to week 5

  const {
    data: weeklyStandings,
    isLoading: weeklyLoading,
    error: weeklyError,
  } = useQuery({
    queryKey: ['weeklyStandings', leagueId, currentWeek],
    queryFn: () => standingsApi.getWeeklyStandings(leagueId, currentWeek),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const {
    data: overallStandings,
    isLoading: overallLoading,
    error: overallError,
  } = useQuery({
    queryKey: ['overallStandings', leagueId],
    queryFn: () => standingsApi.getOverallStandings(leagueId),
    refetchInterval: 10000,
  });

  const isLoading = weeklyLoading || overallLoading;

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold text-green-800 mb-6">Standings</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Weekly Standings */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-green-600 text-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold">Week {currentWeek}</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentWeek((prev) => Math.max(1, prev - 1))}
                  disabled={currentWeek <= 1}
                  className="px-2 py-1 bg-green-700 hover:bg-green-800 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  ←
                </button>
                <button
                  onClick={() => setCurrentWeek((prev) => Math.min(15, prev + 1))}
                  disabled={currentWeek >= 15}
                  className="px-2 py-1 bg-green-700 hover:bg-green-800 rounded disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  →
                </button>
              </div>
            </div>
          </div>

          <div className="p-4">
            {weeklyError ? (
              <ErrorMessage
                message={(weeklyError as any)?.response?.data?.message || 'Failed to load standings'}
              />
            ) : weeklyStandings && weeklyStandings.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-semibold text-gray-700">Rank</th>
                    <th className="p-2 font-semibold text-gray-700">Player</th>
                    <th className="p-2 text-right font-semibold text-gray-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyStandings.map((standing) => (
                    <tr key={standing.user.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-2 font-bold text-gray-800">{standing.rank}</td>
                      <td className="p-2">{standing.user.name}</td>
                      <td className="p-2 text-right font-bold text-green-600">
                        {standing.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 text-center py-4">No scores yet for this week</p>
            )}
          </div>
        </div>

        {/* Overall Standings */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-blue-600 text-white p-4">
            <h3 className="text-xl font-bold">Overall Season</h3>
          </div>

          <div className="p-4">
            {overallError ? (
              <ErrorMessage
                message={(overallError as any)?.response?.data?.message || 'Failed to load standings'}
              />
            ) : overallStandings && overallStandings.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="border-b text-left">
                    <th className="p-2 font-semibold text-gray-700">Rank</th>
                    <th className="p-2 font-semibold text-gray-700">Player</th>
                    <th className="p-2 text-right font-semibold text-gray-700">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {overallStandings.map((standing) => (
                    <tr key={standing.user.id} className="border-b last:border-b-0 hover:bg-gray-50">
                      <td className="p-2">
                        {standing.rank === 1 && <span className="text-2xl">🏆</span>}
                        {standing.rank === 2 && <span className="text-2xl">🥈</span>}
                        {standing.rank === 3 && <span className="text-2xl">🥉</span>}
                        {standing.rank > 3 && (
                          <span className="font-bold text-gray-800">{standing.rank}</span>
                        )}
                      </td>
                      <td className="p-2">
                        <span className={standing.rank === 1 ? 'font-bold' : ''}>
                          {standing.user.name}
                        </span>
                      </td>
                      <td className="p-2 text-right font-bold text-blue-600">
                        {standing.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 text-center py-4">No scores yet this season</p>
            )}
          </div>
        </div>
      </div>

      {/* Scoring Legend */}
      <div className="mt-6 bg-white rounded-lg shadow p-6">
        <h3 className="font-bold text-gray-800 mb-3">Scoring System</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="font-semibold text-green-600">+1 point</div>
            <div className="text-gray-600">Regular Win</div>
          </div>
          <div>
            <div className="font-semibold text-green-700">+2 points</div>
            <div className="text-gray-600">Upset Win</div>
          </div>
          <div>
            <div className="font-semibold text-gray-600">0 points</div>
            <div className="text-gray-600">Regular Loss</div>
          </div>
          <div>
            <div className="font-semibold text-red-600">-1 point</div>
            <div className="text-gray-600">Upset Loss</div>
          </div>
        </div>
      </div>
    </div>
  );
}
