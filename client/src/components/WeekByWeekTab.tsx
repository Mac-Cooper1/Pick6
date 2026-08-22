/**
 * Week by Week — every player × every week in one grid, with a per-team
 * drill-down for the selected week (result, score, spread, upset badge).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { standingsApi, WeekDetailTeam } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage } from './ErrorMessage';

interface WeekByWeekTabProps {
  leagueId: number;
}

function cellClasses(points: number | undefined): string {
  if (points === undefined) return 'text-gray-300';
  if (points > 0) return 'bg-green-100 text-green-800 font-semibold';
  if (points < 0) return 'bg-red-100 text-red-700 font-semibold';
  return 'text-gray-500';
}

function resultBadge(team: WeekDetailTeam) {
  if (team.result === 'W') {
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
        team.wasUpset ? 'bg-green-600 text-white' : 'bg-green-100 text-green-800'
      }`}>
        W{team.wasUpset ? ' ⚡' : ''}
      </span>
    );
  }
  if (team.result === 'L') {
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
        team.wasUpset ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
      }`}>
        L{team.wasUpset ? ' ⚡' : ''}
      </span>
    );
  }
  if (team.result === 'pending') {
    return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-100 text-yellow-800">–</span>;
  }
  return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-400">bye</span>;
}

export function WeekByWeekTab({ leagueId }: WeekByWeekTabProps) {
  const { user } = useAuth();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const { data: grid, isLoading, error } = useQuery({
    queryKey: ['seasonGrid', leagueId],
    queryFn: () => standingsApi.getSeasonGrid(leagueId),
    refetchInterval: 30000,
  });

  const week = selectedWeek ?? grid?.currentWeek ?? null;

  const { data: detail } = useQuery({
    queryKey: ['weekDetail', leagueId, week],
    queryFn: () => standingsApi.getWeekDetail(leagueId, week!),
    enabled: week !== null,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (error || !grid) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage message="Failed to load week-by-week standings" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Season grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-green-700 text-white p-4">
          <h2 className="text-xl font-bold">Week by Week</h2>
          <p className="text-green-100 text-sm">
            Click a week for game-by-game detail · currently week {grid.currentWeek}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left text-gray-600 font-semibold sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                  Player
                </th>
                {grid.weeks.map((w) => (
                  <th key={w.weekNumber} className="p-1 text-center">
                    <button
                      onClick={() => setSelectedWeek(w.weekNumber)}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded font-semibold transition-colors touch-manipulation ${
                        week === w.weekNumber
                          ? 'bg-green-600 text-white'
                          : w.weekNumber === grid.currentWeek
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                      }`}
                      title={w.label}
                    >
                      {w.weekNumber}
                    </button>
                  </th>
                ))}
                <th className="p-2 text-right text-gray-700 font-bold">Total</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr
                  key={row.userId}
                  className={`border-t ${row.userId === user?.id ? 'bg-green-50' : 'bg-white'}`}
                >
                  {/* Explicit row backgrounds above: the sticky cell inherits them, so
                      week cells no longer show through it when the grid scrolls sideways */}
                  <td className="p-2 font-medium sticky left-0 bg-inherit z-10 whitespace-nowrap border-r border-gray-200">
                    <span className="text-gray-400 text-xs mr-1">{row.rank}.</span>
                    {row.userName}
                  </td>
                  {grid.weeks.map((w) => {
                    const pts = row.byWeek[w.weekNumber];
                    return (
                      <td
                        key={w.weekNumber}
                        className={`p-1 text-center ${cellClasses(pts)} ${
                          week === w.weekNumber ? 'ring-1 ring-inset ring-green-400' : ''
                        }`}
                      >
                        {pts ?? '·'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-bold text-green-700">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Week detail */}
      {week !== null && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gray-100 p-4">
            <h3 className="font-bold text-gray-800">
              Week {week} — game by game
              {detail === undefined && <span className="text-gray-400 font-normal ml-2">loading…</span>}
            </h3>
          </div>
          {detail && (
            <div className="divide-y">
              {detail.members.map((member) => (
                <div key={member.userId} className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`font-bold ${member.userId === user?.id ? 'text-green-700' : 'text-gray-800'}`}>
                      {member.userName}
                    </h4>
                    <span className={`font-bold ${
                      member.weekTotal > 0 ? 'text-green-700' : member.weekTotal < 0 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {member.weekTotal > 0 ? '+' : ''}{member.weekTotal} pts
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {member.teams.map((team) => (
                      <div key={team.teamId} className="bg-gray-50 rounded p-2 text-xs">
                        <div className="text-gray-400 mb-0.5">{team.slotLabel}</div>
                        <div className="font-semibold text-sm leading-tight break-words">{team.teamName}</div>
                        <div className="flex items-start justify-between gap-1 mt-1">
                          <span className="text-gray-500 break-words leading-tight min-w-0">
                            {team.opponent ? `vs ${team.opponent}` : 'no game'}
                            {team.teamSpread !== null && (
                              <span className="ml-1 text-gray-400 whitespace-nowrap">
                                ({team.teamSpread > 0 ? '+' : ''}{team.teamSpread})
                              </span>
                            )}
                          </span>
                          <span className="shrink-0">{resultBadge(team)}</span>
                        </div>
                        {team.scoreLine && (
                          <div className="mt-1 flex items-center justify-between">
                            <span className="text-gray-500">{team.scoreLine}</span>
                            <span className={`font-bold ${
                              team.points > 0 ? 'text-green-700' : team.points < 0 ? 'text-red-600' : 'text-gray-400'
                            }`}>
                              {team.points > 0 ? '+' : ''}{team.points}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
