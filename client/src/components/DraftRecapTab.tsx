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
        `Swap complete — your new team counts from week ${data.effectiveFromWeek} on.`
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
      setSwapSuccess('You passed — you can still swap after everyone has had their turn, until the window closes.');
      invalidateAll();
    },
    onError: (err: any) => setSwapError(err.response?.data?.message || 'Pass failed'),
  });

  if (rostersLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (rostersError) {
    return (
      <div className="p-6">
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
    <div className="p-6 space-y-6">
      {/* Swap window (visible once opened) */}
      {swapState && swapState.status !== 'NOT_OPEN' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className={`p-4 text-white ${swapState.status === 'OPEN' ? 'bg-amber-600' : 'bg-gray-500'}`}>
            <h3 className="font-bold text-lg">
              Week 5 Swap {swapState.status === 'OPEN' ? '— window open' : '— window closed'}
            </h3>
            {swapState.status === 'OPEN' && (
              <p className="text-amber-100 text-sm">
                One same-slot swap each, worst record first.
                {swapState.freePhase
                  ? ' All turns are done — anyone who hasn’t swapped may swap until the commissioner closes the window.'
                  : onTheClockMe
                  ? " It's your turn!"
                  : ` On the clock: ${onTheClockName ?? '—'}`}
                {swapState.turnDeadline && !swapState.freePhase && (
                  <> · turn ends {new Date(swapState.turnDeadline).toLocaleString()}</>
                )}
              </p>
            )}
          </div>

          {/* Order strip */}
          <div className="px-4 py-3 flex flex-wrap gap-2 border-b">
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
                {o.swapUsed && ' ✓'}
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
              <div className="flex gap-2">
                <button
                  onClick={() => swapMutation.mutate()}
                  disabled={!swapDrop || !swapAddId || swapMutation.isPending}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {swapMutation.isPending ? 'Swapping…' : 'Confirm Swap (one per season!)'}
                </button>
                {onTheClockMe && (
                  <button
                    onClick={() => passMutation.mutate()}
                    disabled={passMutation.isPending}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Pass my turn
                  </button>
                )}
              </div>
            </div>
          )}

          {swapState.status === 'OPEN' && myEntry?.swapUsed && (
            <p className="px-4 pb-4 text-sm text-gray-500">You've used your swap. ✓</p>
          )}
        </div>
      )}

      {/* Rosters by slot */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="bg-green-600 text-white p-4">
          <h2 className="text-lg font-bold">Draft Recap — Rosters by Slot</h2>
        </div>

        {!hasAnyRoster ? (
          <p className="p-6 text-gray-500 text-center">
            No teams drafted yet. Rosters will appear here once the draft begins.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-gray-600 font-semibold sticky left-0 bg-gray-50">Player</th>
                  {DRAFT_SLOTS.map((slot) => (
                    <th key={slot} className="p-3 text-left text-gray-600 font-semibold">
                      {SLOT_LABELS[slot]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rosters?.map((member, idx) => (
                  <tr
                    key={member.userId}
                    className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${
                      member.userId === user?.id ? 'bg-green-50' : ''
                    }`}
                  >
                    <td className="p-3 font-semibold text-gray-800 sticky left-0 bg-inherit">
                      {member.userName}
                      {member.userId === user?.id && (
                        <span className="text-green-600 text-xs ml-1">(You)</span>
                      )}
                      {member.swapUsed && (
                        <span className="block text-xs text-amber-600 font-normal">swap used</span>
                      )}
                    </td>
                    {DRAFT_SLOTS.map((slot) => {
                      const entry = member.roster.find((r) => r.slot === slot);
                      return (
                        <td key={slot} className="p-3">
                          {entry ? (
                            <div>
                              <div className="font-medium">
                                {entry.teamName}
                                {entry.fromWeek > 1 && (
                                  <span
                                    className="ml-1 text-xs text-amber-600"
                                    title={`Swapped in — counts from week ${entry.fromWeek}`}
                                  >
                                    (wk {entry.fromWeek}+)
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500">{entry.conference}</div>
                            </div>
                          ) : (
                            <span className="text-gray-300">—</span>
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
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-gray-100 p-4">
            <h3 className="font-bold text-gray-800">Pick-by-Pick</h3>
          </div>
          <div className="divide-y">
            {Array.from(rounds.entries()).map(([round, roundPicks]) => (
              <div key={round} className="p-4">
                <h4 className="text-sm font-bold text-gray-500 mb-2">Round {round}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {roundPicks.map((pick) => (
                    <div
                      key={pick.id}
                      className={`p-2 rounded text-sm flex items-center gap-2 ${
                        pick.user.id === user?.id ? 'bg-green-50' : 'bg-gray-50'
                      }`}
                    >
                      <span className="text-gray-400 font-mono text-xs w-8">#{pick.pickNumber}</span>
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
