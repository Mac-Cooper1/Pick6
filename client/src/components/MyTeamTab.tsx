/**
 * My Team Tab
 *
 * Your five teams and their games this week: opponent, kickoff, venue, TV
 * network, and the stored spread (the exact line scoring uses). Also home of
 * the week-5 swap flow (moved here from the retired Draft Recap tab):
 * worst-record-first turns, one same-slot swap each.
 */

import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi, rosterApi, swapApi, matchupApi, cfbApi, TeamMatchup } from '../services/api';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';
import { Button } from './Button';
import { DRAFT_SLOTS, SLOT_LABELS, ConferenceSlot, RosterEntry, Team } from '../types';

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
  const queryClient = useQueryClient();

  const [swapDrop, setSwapDrop] = useState<RosterEntry | null>(null);
  const [swapAddId, setSwapAddId] = useState<number | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });
  const currentLeague = leagues?.find((l) => l.id === leagueId);

  const {
    data: matchups,
    isLoading: matchupsLoading,
    error: matchupsError,
  } = useQuery({
    queryKey: ['myMatchups', leagueId],
    queryFn: () => matchupApi.getMyMatchups(leagueId),
    refetchInterval: 60000,
  });

  const { data: myRoster } = useQuery({
    queryKey: ['myRoster', leagueId],
    queryFn: () => rosterApi.getMyRoster(leagueId),
  });

  const { data: swapState } = useQuery({
    queryKey: ['swapState', leagueId],
    queryFn: () => swapApi.getState(leagueId),
    refetchInterval: 30000,
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

  // Week-5 swap plumbing (moved from the retired Draft Recap tab)
  const myEntry = swapState?.order.find((o) => o.userId === user?.id);
  const canSwap =
    swapState?.status === 'OPEN' &&
    myEntry !== undefined &&
    !myEntry.swapUsed &&
    (swapState.freePhase || swapState.onTheClockUserId === user?.id);
  const onTheClockMe = swapState?.status === 'OPEN' && swapState.onTheClockUserId === user?.id;
  const onTheClockName = swapState?.order.find(
    (o) => o.userId === swapState.onTheClockUserId
  )?.userName;

  const { data: availableTeams } = useQuery({
    queryKey: ['availableSwapTeams', leagueId],
    queryFn: () => rosterApi.getAvailableTeams(leagueId),
    enabled: !!canSwap,
  });

  const swapCandidates: Team[] = (availableTeams || []).filter(
    (t) => swapDrop && t.slot === swapDrop.slot
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['myMatchups', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['myRoster', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['allRosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['swapState', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['availableSwapTeams', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['leagueMembers', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['allMatchups', leagueId] });
  };

  const swapMutation = useMutation({
    mutationFn: () => swapApi.swap(leagueId, swapDrop!.teamId, swapAddId!),
    onSuccess: (data: any) => {
      setSwapSuccess(`Swap complete. Your new team counts from week ${data.effectiveFromWeek} on.`);
      setSwapError(null);
      setSwapDrop(null);
      setSwapAddId(null);
      invalidateAll();
    },
    onError: (err: any) => {
      setSwapError(err.response?.data?.message || 'Swap failed');
      setSwapSuccess(null);
    },
  });

  const passMutation = useMutation({
    mutationFn: () => swapApi.pass(leagueId),
    onSuccess: () => {
      setSwapSuccess('You passed. You can still swap after everyone has had their turn, until the window closes.');
      invalidateAll();
    },
    onError: (err: any) => setSwapError(err.response?.data?.message || 'Pass failed'),
  });

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
      <div>
        <h2 className="section-title">My Team</h2>
        <p className="section-sub">
          Your five, week {currentLeague?.currentWeek ?? ''}. Spreads are the lines scoring uses.
        </p>
      </div>

      {/* Week-5 swap window (visible once opened) */}
      {swapState && swapState.status !== 'NOT_OPEN' && (
        <div className={`card overflow-hidden ${swapState.status === 'OPEN' ? 'border-amber-300' : ''}`}>
          <div className={`p-4 ${swapState.status === 'OPEN' ? 'bg-amber-50 border-b border-amber-200' : 'bg-gray-50 border-b border-gray-200'}`}>
            <div className="flex items-baseline gap-2">
              <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">
                Week 5 Swap
              </h3>
              <span className={`label ${swapState.status === 'OPEN' ? 'text-amber-700' : 'text-gray-500'}`}>
                {swapState.status === 'OPEN' ? 'window open' : 'window closed'}
              </span>
            </div>
            {swapState.status === 'OPEN' && (
              <p className="text-amber-900 text-sm mt-1">
                One same-slot swap each, worst record first.
                {swapState.freePhase
                  ? ' All turns are done. Anyone who has not swapped may swap until the commissioner closes the window.'
                  : onTheClockMe
                  ? " It's your turn!"
                  : ` On the clock: ${onTheClockName ?? 'nobody'}.`}
                {swapState.turnDeadline && !swapState.freePhase && (
                  <> Turn ends {new Date(swapState.turnDeadline).toLocaleString()}.</>
                )}
              </p>
            )}
          </div>

          {/* Order strip */}
          <div className="px-4 py-3 flex flex-wrap gap-2 border-b border-gray-200">
            {swapState.order.map((o) => (
              <span
                key={o.userId}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  o.swapUsed
                    ? 'bg-green-100 text-green-800'
                    : o.swapSkipped
                    ? 'bg-gray-100 text-gray-500 line-through'
                    : o.userId === swapState.onTheClockUserId
                    ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-400'
                    : 'bg-gray-100 text-gray-700'
                }`}
                title={o.swapUsed ? 'Swapped' : o.swapSkipped ? 'Passed' : `Turn ${o.swapOrder}`}
              >
                {o.swapOrder}. {o.userName}
                {o.swapUsed && <span className="ml-1 normal-case opacity-70">swapped</span>}
              </span>
            ))}
          </div>

          {swapError && <div className="px-4 pt-3"><ErrorMessage message={swapError} /></div>}
          {swapSuccess && (
            <div className="mx-4 mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              {swapSuccess}
            </div>
          )}

          {/* My swap controls */}
          {canSwap && (
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Drop</label>
                  <select
                    value={swapDrop?.teamId ?? ''}
                    onChange={(e) => {
                      const entry = myRoster?.find((t) => t.teamId === parseInt(e.target.value));
                      setSwapDrop(entry ?? null);
                      setSwapAddId(null);
                    }}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Choose a team to drop…</option>
                    {myRoster?.map((t) => (
                      <option key={t.teamId} value={t.teamId}>
                        {t.teamName} ({t.slotLabel})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    Add {swapDrop ? `(${SLOT_LABELS[swapDrop.slot as ConferenceSlot]} only)` : ''}
                  </label>
                  <select
                    value={swapAddId ?? ''}
                    onChange={(e) => setSwapAddId(parseInt(e.target.value) || null)}
                    disabled={!swapDrop}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-500 disabled:bg-gray-100"
                  >
                    <option value="">
                      {swapDrop ? 'Choose your new team…' : 'Pick a drop first'}
                    </option>
                    {swapCandidates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.conference})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="amber"
                  onClick={() => swapMutation.mutate()}
                  disabled={!swapDrop || !swapAddId || swapMutation.isPending}
                >
                  {swapMutation.isPending ? 'Swapping…' : 'Confirm Swap (one per season!)'}
                </Button>
                {onTheClockMe && (
                  <Button
                    variant="secondary"
                    onClick={() => passMutation.mutate()}
                    disabled={passMutation.isPending}
                  >
                    Pass my turn
                  </Button>
                )}
              </div>
            </div>
          )}

          {swapState.status === 'OPEN' && myEntry?.swapUsed && (
            <p className="px-4 pb-4 text-sm text-gray-500">You've used your swap.</p>
          )}
        </div>
      )}

      {/* One card per slot */}
      {!matchups || matchups.length === 0 ? (
        <div className="card p-6 sm:p-10 text-center text-gray-500">
          <p className="font-display font-bold uppercase tracking-wide text-xl text-gray-700 mb-1">
            No teams yet
          </p>
          <p className="text-sm">
            Your five teams and their weekly games will live here once you draft.
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
            const showScore = game && (isLive || isFinal) && game.homeScore !== null && game.awayScore !== null;
            const myScore = game ? (game.isHomeTeam ? game.homeScore : game.awayScore) : null;
            const oppScore = game ? (game.isHomeTeam ? game.awayScore : game.homeScore) : null;

            return (
              <div key={slot} className="card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="label text-[11px]">{SLOT_LABELS[slot]}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {teamRank && (
                        <span className="bg-amber-400 text-amber-950 font-display font-bold text-xs px-1.5 py-0.5 rounded">
                          #{teamRank}
                        </span>
                      )}
                      <span className="font-display font-bold uppercase tracking-wide text-xl sm:text-2xl text-gray-900 truncate">
                        {m.teamName}
                      </span>
                      {m.fromWeek > 1 && (
                        <span
                          className="label text-[11px] text-amber-700 shrink-0"
                          title={`Swapped in. Counts from week ${m.fromWeek}.`}
                        >
                          wk {m.fromWeek}+
                        </span>
                      )}
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
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
