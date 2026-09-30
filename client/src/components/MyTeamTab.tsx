/**
 * My Team Tab
 *
 * Your five teams and their games this week: opponent, kickoff, venue, TV
 * network, and the stored spread (the exact line scoring uses). The week-6
 * swap has its own tab (SwapTab).
 */

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi, matchupApi, cfbApi, TeamMatchup } from '../services/api';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';
import { SwapBadge } from './SwapBadge';
import { DRAFT_SLOTS, SLOT_LABELS, ConferenceSlot } from '../types';

interface MyTeamTabProps {
  leagueId: number;
}

// Team-relative spread (+3.5 = underdog by 3.5); the league scores off these
function formatSpread(spread: number | null | undefined): string {
  if (spread === null || spread === undefined) return '';
  if (spread === 0) return 'PK';
  return spread > 0 ? `+${spread}` : `${spread}`;
}

function formatKickoff(startTime: string): string {
  const date = new Date(startTime);
  const day = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

export function MyTeamTab({ leagueId }: MyTeamTabProps) {
  const { user } = useAuth();

  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });
  const currentLeague = leagues?.find((l) => l.id === leagueId);

  // Whose team is on screen: yours by default, any league-mate's via the
  // dropdown. Swap controls only ever render on your own view.
  const [viewUserId, setViewUserId] = useState<number | null>(null);
  const viewingUserId = viewUserId ?? user?.id;
  const viewingSelf = viewingUserId === user?.id;
  const viewedMember = currentLeague?.members?.find((m) => m.id === viewingUserId);

  const {
    data: matchups,
    isLoading: matchupsLoading,
    error: matchupsError,
  } = useQuery({
    queryKey: ['myMatchups', leagueId, viewingUserId],
    queryFn: () => matchupApi.getMyMatchups(leagueId, undefined, viewingSelf ? undefined : viewingUserId),
    enabled: !!viewingUserId,
    refetchInterval: 60000,
  });

  // AP ranks, keyed by abbreviation (same source the draft room autopick uses)
  const { data: rankings } = useQuery({
    queryKey: ['rankings'],
    queryFn: () => cfbApi.getRankings(),
    staleTime: 3600000,
  });

  const rankingsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const team of rankings?.teams || []) {
      if (team.abbreviation) map.set(team.abbreviation.toUpperCase(), team.rank);
    }
    return map;
  }, [rankings]);

  const rankFor = (abbreviation: string | null | undefined) =>
    abbreviation ? rankingsMap.get(abbreviation.toUpperCase()) : undefined;

  if (matchupsLoading) return <Loading inline />;

  if (matchupsError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage message="Failed to load your matchups" />
      </div>
    );
  }

  // Order the cards by slot, the same order as the draft
  const matchupBySlot = new Map<ConferenceSlot, TeamMatchup>();
  for (const m of matchups || []) {
    matchupBySlot.set(m.slot as ConferenceSlot, m);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="section-title">
            {viewingSelf ? 'My Team' : `${viewedMember?.name ?? 'Their'}'s Team`}
          </h2>
          <p className="section-sub">
            {viewingSelf ? 'Your' : 'Their'} five, week {currentLeague?.currentWeek ?? ''}. Spreads are the lines scoring uses.
          </p>
        </div>
        {(currentLeague?.members?.length ?? 0) > 1 && (
          <div className="self-start sm:self-auto">
            <label htmlFor="teamViewer" className="label block mb-1">Viewing</label>
            {/* 16px on phones or iOS Safari zooms the page on focus */}
            <select
              id="teamViewer"
              value={viewingUserId ?? ''}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setViewUserId(id === user?.id ? null : id);
              }}
              className="px-3 py-2 text-base sm:text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
            >
              {user && <option value={user.id}>My team</option>}
              {currentLeague?.members
                ?.filter((m) => m.id !== user?.id)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
            </select>
          </div>
        )}
      </div>

      {/* One card per slot */}
      {!matchups || matchups.length === 0 ? (
        <div className="card p-6 sm:p-10 text-center text-gray-500">
          <p className="font-display font-bold uppercase tracking-wide text-xl text-gray-700 mb-1">
            No teams yet
          </p>
          <p className="text-sm">
            {viewingSelf
              ? 'Your five teams and their weekly games will live here once you draft.'
              : 'Their teams will show up here once the draft begins.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {DRAFT_SLOTS.map((slot) => {
            const m = matchupBySlot.get(slot);
            if (!m) return null;
            const game = m.game;
            const teamRank = rankFor(m.abbreviation);
            const oppRank = game ? rankFor(game.opponentAbbreviation) : undefined;
            const teamSpread = m.odds?.teamSpread;
            const isLive = game?.status === 'in_progress';
            const isFinal = game?.status === 'final';
            // Double-game rolled into this bye week (FSU's Sep 7 game counts as week 2)
            const rolledIn =
              game !== null && currentLeague?.currentWeek !== undefined && game.playedWeek !== currentLeague.currentWeek;
            const showScore = game && (isLive || isFinal) && game.homeScore !== null && game.awayScore !== null;
            const myScore = game ? (game.isHomeTeam ? game.homeScore : game.awayScore) : null;
            const oppScore = game ? (game.isHomeTeam ? game.awayScore : game.homeScore) : null;

            return (
              <div key={slot} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="label text-[11px]">{SLOT_LABELS[slot]}</span>
                      <span
                        className={`text-[11px] font-semibold tabular-nums ${
                          m.seasonPoints > 0 ? 'text-green-700' : m.seasonPoints < 0 ? 'text-red-600' : 'text-gray-400'
                        }`}
                        title="Net points this team has earned for this roster on the season"
                      >
                        {m.seasonPoints > 0 ? `+${m.seasonPoints}` : m.seasonPoints} {Math.abs(m.seasonPoints) === 1 ? 'pt' : 'pts'} season
                      </span>
                      <SwapBadge fromWeek={m.fromWeek} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {teamRank && (
                        <span className="bg-amber-400 text-amber-950 font-display font-bold text-xs px-1.5 py-0.5 rounded">
                          #{teamRank}
                        </span>
                      )}
                      <span className="font-display font-bold uppercase tracking-wide text-xl sm:text-2xl text-gray-900 truncate">
                        {m.teamName}
                      </span>
                    </div>
                  </div>

                  {/* Spread, or live/final score */}
                  <div className="text-right shrink-0">
                    {showScore ? (
                      <div>
                        <span className={`font-display font-extrabold text-2xl tabular-nums ${
                          isFinal
                            ? (myScore! > oppScore! ? 'text-green-700' : myScore! < oppScore! ? 'text-red-600' : 'text-gray-700')
                            : 'text-gray-900'
                        }`}>
                          {myScore}-{oppScore}
                        </span>
                        <p className={`label text-[11px] ${isLive ? 'text-red-600' : 'text-gray-500'}`}>
                          {isLive ? 'live' : 'final'}
                        </p>
                      </div>
                    ) : game && teamSpread !== null && teamSpread !== undefined ? (
                      <div>
                        <span
                          className={`font-display font-extrabold text-2xl tabular-nums ${
                            teamSpread >= 3.5
                              ? 'text-green-700'
                              : teamSpread <= -3.5
                              ? 'text-red-600'
                              : 'text-gray-700'
                          }`}
                          title={
                            teamSpread >= 3.5
                              ? 'Underdog of 3.5+: a win scores 2'
                              : teamSpread <= -3.5
                              ? 'Favorite by 3.5+: a loss scores -1'
                              : 'Inside the 3.5-point window: regular scoring'
                          }
                        >
                          {formatSpread(teamSpread)}
                        </span>
                        <p className="label text-[11px] text-gray-500">
                          {teamSpread >= 3.5 ? 'upset pays +2' : teamSpread <= -3.5 ? 'loss costs 1' : 'spread'}
                        </p>
                      </div>
                    ) : game ? (
                      <span className="text-xs text-gray-400 italic" title="Books haven't posted a line yet. Odds re-sync daily until kickoff.">
                        no line yet
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Game details */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  {game ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5">
                      <p className="text-gray-800 font-medium">
                        {game.isHomeTeam ? 'vs.' : 'at'}{' '}
                        {oppRank && <span className="font-display font-bold text-amber-700">#{oppRank} </span>}
                        {game.opponent}
                      </p>
                      <p className="text-sm text-gray-500">
                        {game.status === 'postponed' ? (
                          <span className="text-orange-600 font-semibold">Postponed</span>
                        ) : game.status === 'cancelled' ? (
                          <span className="text-red-600 font-semibold">Cancelled</span>
                        ) : (
                          <>
                            {formatKickoff(game.startTime)}
                            {game.venue && <> &middot; {game.venue}</>}
                            {game.broadcast && (
                              <>
                                {' '}&middot;{' '}
                                <span className="font-semibold text-gray-700">{game.broadcast}</span>
                              </>
                            )}
                          </>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 italic">No game this week</p>
                  )}
                  {rolledIn && (
                    <p className="text-xs text-amber-700 mt-1">
                      Played in week {game.playedWeek}. Counts as this week's game because the team is off this week.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
