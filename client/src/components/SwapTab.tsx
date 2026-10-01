/**
 * Week 6 Swap tab
 *
 * Where the swap lives. Week 5: build a private, ranked list of same-slot
 * swaps from the board of every unowned team, most Pick 6 points this season
 * first. Add puts a team on your list against your team in the same slot
 * (one team per slot, so the drop is implied). When week 6 starts the
 * scheduled sync runs every list once in reverse standings (ties: combined
 * SOS rank) and each player gets the highest swap on their list that's still
 * possible. Only teams unowned at the lock can be added, so a dropped team
 * stays out of play. Afterwards the tab shows the league's swaps and how
 * each of your lines went.
 */

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CaretDown, CaretUp, X } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage, leagueApi, swapApi, SwapClaim, SwapLine, SwapState, SwapTeam } from '../services/api';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';
import { Button } from './Button';
import { ConferenceSlot, DRAFT_SLOTS, SLOT_LABELS } from '../types';

interface SwapTabProps {
  leagueId: number;
}

type SlotFilter = ConferenceSlot | 'ALL';

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function Points({ value, className = '' }: { value: number | undefined; className?: string }) {
  if (value === undefined) return null;
  return (
    <span
      className={`font-display font-bold tabular-nums ${
        value > 0 ? 'text-green-700' : value < 0 ? 'text-red-600' : 'text-gray-400'
      } ${className}`}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

const PHASE_LABEL: Record<SwapState['phase'], string> = {
  upcoming: 'not open yet',
  open: 'lists open',
  locked: 'lists locked',
  complete: 'done',
};

const ICON_BUTTON_CLASS =
  'w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed';

// No points on a swap line: they'd read as points changing hands, and a
// swap never moves points (see the note on the board)
function Pair({ drop, add }: { drop: string; add: string }) {
  return (
    <span className="font-medium text-gray-900">
      {drop}
      <ArrowRight size={14} weight="bold" className="inline mx-1.5 -mt-0.5 text-amber-600" aria-hidden />
      <span className="sr-only"> to </span>
      {add}
    </span>
  );
}

function ClaimOutcome({ claim }: { claim: SwapClaim }) {
  if (claim.status === 'SWAPPED') {
    return <span className="label text-[11px] text-green-700 shrink-0">swapped</span>;
  }
  if (claim.status === 'MISSED') {
    return <span className="label text-[11px] text-gray-500 shrink-0">missed</span>;
  }
  if (claim.status === 'UNUSED') {
    return <span className="label text-[11px] text-gray-400 shrink-0">not needed</span>;
  }
  return null;
}

export function SwapTab({ leagueId }: SwapTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [slotFilter, setSlotFilter] = useState<SlotFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });
  const drafted = leagues?.find((l) => l.id === leagueId)?.draftComplete ?? false;

  const { data: state, isLoading, error: stateError } = useQuery({
    queryKey: ['swapState', leagueId],
    queryFn: () => swapApi.getState(leagueId),
    refetchInterval: 30000,
  });

  // The board: every unowned team, most Pick 6 points first (until the run)
  const showBoard = drafted && !!state && state.phase !== 'complete';
  const { data: teams } = useQuery({
    queryKey: ['swapTeams', leagueId],
    queryFn: () => swapApi.getTeams(leagueId),
    enabled: showBoard,
    staleTime: 60000,
  });

  const saveMutation = useMutation({
    mutationFn: (lines: SwapLine[]) => swapApi.saveClaims(leagueId, lines),
    onSuccess: (next) => {
      queryClient.setQueryData(['swapState', leagueId], next);
      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'Could not save your list'));
      setSaved(false);
    },
  });

  if (isLoading) return <Loading inline />;

  if (stateError || !state) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage message="Failed to load the swap" />
      </div>
    );
  }

  const { phase, myClaims, order, swapWeek } = state;
  const editable = phase === 'open' && !state.swapUsed;
  const lines: SwapLine[] = myClaims.map(({ dropTeamId, addTeamId }) => ({ dropTeamId, addTeamId }));
  const busy = saveMutation.isPending;
  const listFull = lines.length >= state.maxClaims;
  const me = order.find((o) => o.userId === user?.id);

  const priorityByAdd = new Map(myClaims.map((c) => [c.addTeamId, c.priority]));
  const myTeamIn = (slot: ConferenceSlot) => teams?.mine.find((t) => t.slot === slot);
  const tiedOnPoints = (points: number) => order.filter((o) => o.points === points).length > 1;

  const save = (next: SwapLine[]) => saveMutation.mutate(next);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lines.length) return;
    const next = [...lines];
    [next[index], next[target]] = [next[target], next[index]];
    save(next);
  };

  const addToList = (team: SwapTeam) => {
    const drop = myTeamIn(team.slot);
    if (drop) save([...lines, { dropTeamId: drop.teamId, addTeamId: team.teamId }]);
  };

  const boardTeams = (teams?.available ?? []).filter(
    (t) => slotFilter === 'ALL' || t.slot === slotFilter
  );
  const filterTeam = slotFilter === 'ALL' ? undefined : myTeamIn(slotFilter);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h2 className="section-title">Week {swapWeek} Swap</h2>
        <p className="section-sub">
          One same-slot swap each, run once for the whole league when week {swapWeek} starts.
        </p>
      </div>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-5 lg:items-start">
        <div className="lg:col-span-2 space-y-4 sm:space-y-6">
          {/* Status */}
          <div
            className={`card p-4 ${
              phase === 'open' || phase === 'locked' ? 'bg-amber-50 border-amber-300' : ''
            }`}
          >
            <p className={`label ${phase === 'open' || phase === 'locked' ? 'text-amber-700' : ''}`}>
              {PHASE_LABEL[phase]}
            </p>
            <p className="font-display font-bold uppercase tracking-wide text-xl text-gray-900 mt-0.5">
              {phase === 'upcoming' && (drafted ? `Lists open ${formatWhen(state.opensAt)}` : 'Opens after your draft')}
              {phase === 'open' && `Locks ${formatWhen(state.locksAt)}`}
              {phase === 'locked' && 'Running at the next sync'}
              {phase === 'complete' && state.ranAt && `Ran ${formatWhen(state.ranAt)}`}
            </p>
            <p className={`text-sm mt-1 ${phase === 'open' || phase === 'locked' ? 'text-amber-900' : 'text-gray-600'}`}>
              {phase === 'upcoming' &&
                `Lists open when week ${swapWeek - 1} starts. Until then, browse the teams you could add.`}
              {phase === 'open' &&
                `Rank up to ${state.maxClaims} same-slot swaps. When week ${swapWeek} starts, every list runs once, worst record first, and you get the highest swap on yours that is still available. Your list is private.`}
              {phase === 'locked' &&
                `Lists are locked. Swaps run with the next scheduled sync, before any week ${swapWeek} game kicks off.`}
              {phase === 'complete' &&
                `New teams count from week ${swapWeek}; earlier weeks keep their points.`}
            </p>
          </div>

          {/* Order: projected chips before the run, the recap after */}
          {phase === 'complete' ? (
            <div className="card p-4">
              <p className="label">How the swap went</p>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">
                Reverse standings through week {swapWeek - 1}: the worst record went first. Players
                tied on points were split by schedule strength, and the tougher combined SOS (the
                lower number) went later.
              </p>
              <ol className="divide-y divide-gray-100">
                {order.map((o) => {
                  const you = o.userId === user?.id;
                  const listSize = o.listSize ?? 0;
                  const noSwap = o.swapUsed
                    ? 'Swapped earlier'
                    : listSize === 0
                    ? `No swap: ${you ? 'you' : 'they'} didn't set a list`
                    : `No swap: none of ${you ? 'your' : 'their'} ${listSize} ${listSize === 1 ? 'choice' : 'choices'} went through`;
                  return (
                    <li key={o.userId} className="py-2.5 flex items-start gap-3">
                      <span className="font-display font-bold text-lg leading-6 text-gray-400 w-6 text-center shrink-0">
                        {o.position}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {o.userName}
                            {you && <span className="text-gray-400 font-normal"> (you)</span>}
                          </p>
                          <p className="text-xs text-gray-500 tabular-nums shrink-0">
                            {o.points} {Math.abs(o.points) === 1 ? 'pt' : 'pts'}
                            {tiedOnPoints(o.points) && ` · SOS ${o.sosTotal}`}
                          </p>
                        </div>
                        {o.swap ? (
                          <div className="flex items-baseline justify-between gap-2 mt-0.5">
                            <p className="text-sm min-w-0">
                              <span className="label text-[11px] mr-1.5">{o.swap.slotLabel}</span>
                              <Pair drop={o.swap.dropTeamName} add={o.swap.addTeamName} />
                            </p>
                            <span className="label text-[11px] text-green-700 shrink-0">
                              {ordinal(o.swap.choice)} choice
                            </span>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 mt-0.5">{noSwap}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            drafted && (
              <div className="card p-4">
                <p className="label">Swap order</p>
                <p className="text-xs text-gray-500 mt-0.5 mb-2">
                  {phase === 'locked'
                    ? `Worst record first, from standings through week ${swapWeek - 1}.`
                    : `Worst record first. Projected from current standings; the final order uses standings through week ${swapWeek - 1}.`}
                  {me && ` You go ${ordinal(me.position)} of ${order.length}.`} Tied on points? The
                  tougher combined schedule (ESPN SOS rank of your five, lower is tougher) ranks
                  higher and swaps later.
                </p>
                <div className="flex flex-wrap gap-2">
                  {order.map((o) => (
                    <span
                      key={o.userId}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        o.userId === user?.id
                          ? 'bg-amber-100 text-amber-900 ring-2 ring-amber-400'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                      title={`${o.points} ${Math.abs(o.points) === 1 ? 'pt' : 'pts'} through week ${swapWeek - 1}, combined SOS ${o.sosTotal}`}
                    >
                      {o.position}. {o.userName}
                      <span className="ml-1.5 font-normal opacity-60 tabular-nums">
                        {o.points}
                        {tiedOnPoints(o.points) && ` · SOS ${o.sosTotal}`}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )
          )}

          {/* Your list */}
          {drafted && (
            <div className="card p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="label">
                  Your list{phase === 'open' && lines.length > 0 && ` · ${lines.length} of ${state.maxClaims}`}
                </p>
                {editable && (busy || saved) && (
                  <span className="label text-[11px] text-gray-400">{busy ? 'saving' : 'saved'}</span>
                )}
              </div>

              {error && <ErrorMessage message={error} />}

              {state.swapUsed && phase !== 'complete' ? (
                <p className="text-sm text-gray-500">You've already used your swap.</p>
              ) : myClaims.length === 0 ? (
                <p className="text-sm text-gray-500">
                  {phase === 'upcoming'
                    ? `Your list opens when week ${swapWeek - 1} starts.`
                    : phase === 'open'
                    ? 'No swaps yet. Add teams from Available teams; without a list you keep your five.'
                    : phase === 'locked'
                    ? 'You did not set a list, so you keep your five.'
                    : 'You did not set a list, so you kept your five.'}
                </p>
              ) : (
                <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {myClaims.map((claim, index) => (
                    <li key={claim.priority} className="p-2 sm:p-3 flex items-center gap-3">
                      <span className="font-display font-bold text-lg text-gray-400 w-6 text-center shrink-0">
                        {claim.priority}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="label text-[11px]">{claim.slotLabel}</p>
                        <p className="text-sm">
                          <Pair drop={claim.dropTeamName} add={claim.addTeamName} />
                        </p>
                        {claim.status === 'MISSED' && claim.note && (
                          <p className="text-xs text-gray-500 mt-0.5">{claim.note}</p>
                        )}
                      </div>
                      {editable ? (
                        <div className="flex items-center shrink-0">
                          <button
                            onClick={() => move(index, -1)}
                            disabled={busy || index === 0}
                            className={ICON_BUTTON_CLASS}
                            title="Move up"
                            aria-label={`Move ${claim.addTeamName} up`}
                          >
                            <CaretUp size={16} weight="bold" />
                          </button>
                          <button
                            onClick={() => move(index, 1)}
                            disabled={busy || index === myClaims.length - 1}
                            className={ICON_BUTTON_CLASS}
                            title="Move down"
                            aria-label={`Move ${claim.addTeamName} down`}
                          >
                            <CaretDown size={16} weight="bold" />
                          </button>
                          <button
                            onClick={() => save(lines.filter((_, i) => i !== index))}
                            disabled={busy}
                            className={`${ICON_BUTTON_CLASS} hover:text-red-600`}
                            title="Remove"
                            aria-label={`Remove ${claim.addTeamName} from your list`}
                          >
                            <X size={16} weight="bold" />
                          </button>
                        </div>
                      ) : (
                        <ClaimOutcome claim={claim} />
                      )}
                    </li>
                  ))}
                </ol>
              )}

              {editable && (
                <p className="text-xs text-gray-500">
                  {listFull
                    ? 'Your list is full. Remove a line to add a different swap.'
                    : "List backups for the teams players ahead of you might take. Teams dropped in the swap can't be picked up by anyone."}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Board: every unowned team, most Pick 6 points first */}
        {showBoard && (
          <div className="lg:col-span-3 card overflow-hidden">
            <div className="p-4 pb-3">
              <p className="label">Available teams</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Every unowned team, most Pick 6 points this season first.
                {editable && ' Add puts a team on your list against your team in the same slot.'}
              </p>
              <p className="text-xs text-gray-700 mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="font-semibold">Points don't transfer.</span> A team's points here
                show how it has played this season. Everything you've scored stays yours, and a new
                team only starts scoring for you in week {swapWeek}.
              </p>
            </div>
            <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-gray-200">
              {(['ALL', ...DRAFT_SLOTS] as SlotFilter[]).map((slot) => (
                <button
                  key={slot}
                  onClick={() => setSlotFilter(slot)}
                  className={`shrink-0 px-3 py-1.5 sm:py-1 min-h-[2.25rem] sm:min-h-0 rounded-full font-display font-semibold uppercase tracking-wider text-xs transition-colors touch-manipulation ${
                    slotFilter === slot
                      ? 'bg-green-900 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300'
                  }`}
                >
                  {slot === 'ALL' ? 'All' : SLOT_LABELS[slot]}
                </button>
              ))}
            </div>

            {filterTeam && (
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 text-sm flex items-center justify-between gap-3">
                <span className="text-gray-600 min-w-0">
                  Your {SLOT_LABELS[filterTeam.slot]} team:{' '}
                  <span className="font-semibold text-gray-900">{filterTeam.name}</span>{' '}
                  <span className="text-gray-500">
                    {filterTeam.wins}-{filterTeam.losses}
                  </span>
                </span>
                <Points value={filterTeam.points} className="text-lg shrink-0" />
              </div>
            )}

            {!teams ? (
              <Loading inline />
            ) : boardTeams.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No unowned teams in this slot.</p>
            ) : (
              <ol className="divide-y divide-gray-100">
                {boardTeams.map((team, index) => {
                  const priority = priorityByAdd.get(team.teamId);
                  const drop = myTeamIn(team.slot);
                  // Record first so a narrow screen truncates the conference, not the W-L
                  const details = [
                    `${team.wins}-${team.losses}`,
                    ...(slotFilter === 'ALL' ? [team.slotLabel] : []),
                    ...(team.conference !== team.slotLabel ? [team.conference] : []),
                  ].join(' · ');
                  return (
                    <li key={team.teamId} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="font-display font-bold text-gray-400 w-6 text-center shrink-0 tabular-nums">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 leading-snug">{team.name}</p>
                        <p className="text-xs text-gray-500 truncate">{details}</p>
                      </div>
                      <Points value={team.points} className="text-xl w-10 text-right shrink-0" />
                      {editable && (
                        <div className="w-14 sm:w-24 shrink-0 flex justify-end">
                          {priority !== undefined ? (
                            <span className="label text-[11px] text-amber-700" title={`On your list at #${priority}`}>
                              #{priority}
                              <span className="hidden sm:inline"> on list</span>
                            </span>
                          ) : (
                            <Button
                              variant="amber"
                              size="sm"
                              onClick={() => addToList(team)}
                              disabled={busy || listFull || !drop}
                              title={drop ? `Drop ${drop.name}, add ${team.name}` : undefined}
                            >
                              Add
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
