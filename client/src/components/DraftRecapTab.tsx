/**
 * Draft Recap Tab
 *
 * Everyone's roster laid out by conference slot, the full pick-by-pick draft
 * order, and — once the window opens after week 5 — the swap flow (WS8):
 * worst-record-first turns, one same-slot swap each.
 */

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { draftApi, rosterApi, swapApi } from '../services/api';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';
import { Button } from './Button';
import { DRAFT_SLOTS, SLOT_LABELS, ConferenceSlot, RosterEntry, Team } from '../types';

interface DraftRecapTabProps {
  leagueId: number;
}

export function DraftRecapTab({ leagueId }: DraftRecapTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [swapDrop, setSwapDrop] = useState<RosterEntry | null>(null);
  const [swapAddId, setSwapAddId] = useState<number | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  const {
    data: rosters,
    isLoading: rostersLoading,
    error: rostersError,
  } = useQuery({
    queryKey: ['allRosters', leagueId],
    queryFn: () => rosterApi.getAllRosters(leagueId),
  });

  const { data: picks } = useQuery({
    queryKey: ['draftPicks', leagueId],
    queryFn: () => draftApi.getDraftPicks(leagueId),
  });

  const { data: swapState } = useQuery({
    queryKey: ['swapState', leagueId],
    queryFn: () => swapApi.getState(leagueId),
    refetchInterval: 30000,
  });

  const myEntry = swapState?.order.find((o) => o.userId === user?.id);
  const canSwap =
    swapState?.status === 'OPEN' &&
    myEntry !== undefined &&
    !myEntry.swapUsed &&
    (swapState.freePhase || swapState.onTheClockUserId === user?.id);
  const onTheClockMe = swapState?.status === 'OPEN' && swapState.onTheClockUserId === user?.id;

  // Swap targets: unrostered draft-pool teams, filtered to the drop slot
  const { data: availableTeams } = useQuery({
    queryKey: ['availableSwapTeams', leagueId],
    queryFn: () => rosterApi.getAvailableTeams(leagueId),
    enabled: !!canSwap,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['allRosters', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['swapState', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['availableSwapTeams', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['leagueMembers', leagueId] });
    queryClient.invalidateQueries({ queryKey: ['allMatchups', leagueId] });
  };

  const swapMutation = useMutation({
    mutationFn: () => swapApi.swap(leagueId, swapDrop!.teamId, swapAddId!),
    onSuccess: (data: any) => {
      setSwapSuccess(
        `Swap complete. Your new team counts from week ${data.effectiveFromWeek} on.`
      );
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

  if (rostersLoading) return <Loading inline />;

  if (rostersError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage message="Failed to load rosters" />
      </div>
    );
  }

  const hasAnyRoster = rosters?.some((r) => r.roster.length > 0);
  const onTheClockName = swapState?.order.find(
    (o) => o.userId === swapState.onTheClockUserId
  )?.userName;

  const swapCandidates: Team[] = (availableTeams || []).filter(
    (t) => swapDrop && t.slot === swapDrop.slot
  );

  // Group picks by round for the pick-by-pick list
  const rounds = new Map<number, NonNullable<typeof picks>>();
  for (const pick of picks || []) {
    const list = rounds.get(pick.round) || [];
    list.push(pick);
    rounds.set(pick.round, list);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Swap window (visible once opened) */}
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
                      const entry = rosters
                        ?.find((r) => r.userId === user?.id)
                        ?.roster.find((t) => t.teamId === parseInt(e.target.value));
                      setSwapDrop(entry ?? null);
                      setSwapAddId(null);
                    }}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">Choose a team to drop…</option>
                    {rosters
                      ?.find((r) => r.userId === user?.id)
                      ?.roster.map((t) => (
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

      {/* Rosters by slot */}
      <div>
        <h2 className="section-title">Draft Recap</h2>
        <p className="section-sub">Everyone's roster, one team per slot</p>
      </div>
      <div className="card overflow-hidden">

        {!hasAnyRoster ? (
          <p className="p-6 text-gray-500 text-center">
            No teams drafted yet. Rosters will appear here once the draft begins.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="label text-left p-2 sm:p-3 sticky left-0 z-10 bg-gray-50 border-r border-gray-200">Player</th>
                  {DRAFT_SLOTS.map((slot) => (
                    <th key={slot} className="label text-left p-2 sm:p-3 min-w-[8.5rem] whitespace-nowrap">
                      {SLOT_LABELS[slot]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosters?.map((member, idx) => (
                  <tr
                    key={member.userId}
                    className={
                      member.userId === user?.id
                        ? 'bg-green-50'
                        : idx % 2 === 0
                        ? 'bg-white'
                        : 'bg-gray-50'
                    }
                  >
                    <td className="p-2 sm:p-3 font-semibold text-gray-800 sticky left-0 z-10 bg-inherit border-r border-gray-200 whitespace-nowrap">
                      {member.userName}
                      {member.userId === user?.id && (
                        <span className="label text-green-700 ml-1.5">You</span>
                      )}
                      {member.swapUsed && (
                        <span className="block label text-[11px] text-amber-700">swap used</span>
                      )}
                    </td>
                    {DRAFT_SLOTS.map((slot) => {
                      const entry = member.roster.find((r) => r.slot === slot);
                      return (
                        <td key={slot} className="p-2 sm:p-3">
                          {entry ? (
                            <div>
                              <div className="font-medium">
                                {entry.teamName}
                                {entry.fromWeek > 1 && (
                                  <span
                                    className="ml-1 text-xs text-amber-600"
                                    title={`Swapped in. Counts from week ${entry.fromWeek}.`}
                                  >
                                    (wk {entry.fromWeek}+)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">{entry.conference}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pick-by-pick order */}
      {picks && picks.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Pick by Pick</h3>
          </div>
          <div className="divide-y divide-gray-200">
            {Array.from(rounds.entries()).map(([round, roundPicks]) => (
              <div key={round} className="p-4">
                <h4 className="label mb-2">Round {round}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {roundPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className={`p-2 rounded-lg text-sm flex items-center gap-2 border ${
                        pick.user.id === user?.id ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <span className="font-display font-bold text-gray-400 w-8">{pick.pickNumber}</span>
                      <div className="flex-1">
                        <span className="font-medium">{pick.team.name}</span>
                        <span className="text-xs text-gray-500 ml-1">
                          {SLOT_LABELS[pick.team.slot]}
                        </span>
                        {pick.wasAutoPick && (
                          <span className="text-xs text-orange-600 ml-1">(auto)</span>
                        )}
                        <div className="text-xs text-gray-500">{pick.user.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
