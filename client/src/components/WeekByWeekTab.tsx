/**
 * Week by Week — every player × every week in one grid, with a per-team
 * drill-down for the selected week (result, score, spread, upset badge).
 */

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { standingsApi, WeekDetailTeam } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';

interface WeekByWeekTabProps {
  leagueId: number;
}

function cellClasses(points: number | undefined): string {
  if (points === undefined) return 'text-gray-300';
  if (points > 0) return 'bg-green-100 text-green-800 font-display font-bold text-base';
  if (points < 0) return 'bg-red-100 text-red-700 font-display font-bold text-base';
  return 'text-gray-500 font-display font-semibold text-base';
}

function resultBadge(team: WeekDetailTeam) {
  if (team.result === 'W') {
    return (
      <span className={`px-1.5 py-0.5 rounded font-display font-bold uppercase tracking-wide text-xs ${
        team.wasUpset ? 'bg-green-700 text-white' : 'bg-green-100 text-green-800'
      }`}>
        {team.wasUpset ? 'Upset W' : 'W'}
      </span>
    );
  }
  if (team.result === 'L') {
    return (
      <span className={`px-1.5 py-0.5 rounded font-display font-bold uppercase tracking-wide text-xs ${
        team.wasUpset ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600'
      }`}>
        {team.wasUpset ? 'Bust L' : 'L'}
      </span>
    );
  }
  if (team.result === 'pending') {
    return <span className="px-1.5 py-0.5 rounded font-display font-semibold uppercase tracking-wide text-xs bg-amber-100 text-amber-800">TBD</span>;
  }
  return <span className="px-1.5 py-0.5 rounded font-display font-semibold uppercase tracking-wide text-xs bg-gray-100 text-gray-400">Bye</span>;
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

  if (isLoading) return <Loading inline />;

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
      <div>
        <h2 className="section-title">Week by Week</h2>
        <p className="section-sub">
          Tap a week for game-by-game detail. Currently week {grid.currentWeek}.
        </p>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="label text-left p-2 sticky left-0 bg-gray-50 z-10 border-r border-gray-200">
                  Player
                </th>
                {grid.weeks.map((w) => (
                  <th key={w.weekNumber} className="p-1 text-center">
                    <button
                      onClick={() => setSelectedWeek(w.weekNumber)}
                      className={`w-9 h-9 sm:w-8 sm:h-8 rounded-lg font-display font-bold text-base transition-colors touch-manipulation ${
                        week === w.weekNumber
                          ? 'bg-green-800 text-white'
                          : w.weekNumber === grid.currentWeek
                          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200'
                          : 'text-gray-600 hover:bg-gray-200 active:bg-gray-300'
                      }`}
                      title={w.label}
                    >
                      {w.weekNumber}
                    </button>
                  </th>
                ))}
                <th className="label text-right p-2 text-gray-800">Total</th>
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
                    <span className="font-display font-bold text-gray-400 mr-1.5">{row.rank}</span>
                    {row.userName}
                  </td>
                  {grid.weeks.map((w) => {
                    const pts = row.byWeek[w.weekNumber];
                    return (
                      <td
                        key={w.weekNumber}
                        className={`p-1 text-center ${cellClasses(pts)} ${
                          week === w.weekNumber ? 'ring-1 ring-inset ring-green-500' : ''
                        }`}
                      >
                        {pts ?? '·'}
                      </td>
                    );
                  })}
                  <td className="p-2 text-right font-display font-bold text-lg text-green-700">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Week detail */}
      {week !== null && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex items-baseline gap-2">
            <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">
              Week {week}
            </h3>
            <span className="text-sm text-gray-500">game by game</span>
            {detail === undefined && <span className="text-gray-400 text-sm ml-auto">loading</span>}
          </div>
          {detail && (
            <div className="divide-y">
              {detail.members.map((member) => (
                <div key={member.userId} className="p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className={`font-semibold ${member.userId === user?.id ? 'text-green-700' : 'text-gray-900'}`}>
                      {member.userName}
                    </h4>
                    <span className={`font-display font-bold text-xl leading-none ${
                      member.weekTotal > 0 ? 'text-green-700' : member.weekTotal < 0 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {member.weekTotal > 0 ? '+' : ''}{member.weekTotal} <span className="text-sm text-gray-400 font-semibold">pts</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    {member.teams.map((team) => (
                      <div key={team.teamId} className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-xs">
                        <div className="label text-[11px] mb-0.5">{team.slotLabel}</div>
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
                            <span className={`font-display font-bold text-base leading-none ${
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
