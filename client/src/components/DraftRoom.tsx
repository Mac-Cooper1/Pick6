/**
 * Live Draft Room Component
 *
 * Real-time slot-aware snake draft over Socket.IO: 5 rounds, one team per
 * conference slot (SEC, Big Ten, ACC+ND, Big 12, Group of 6), league-wide
 * team exclusivity. Countdown timer, draft board, queue, activity feed.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { draftApi, leagueApi } from '../services/api';
import {
  connectToDraft,
  disconnectFromDraft,
  makePick as socketMakePick,
  updateQueue as socketUpdateQueue,
  startDraft as socketStartDraft,
  DraftState,
} from '../services/socket';
import { ErrorMessage } from './ErrorMessage';
import { Team, ConferenceSlot, DRAFT_SLOTS, SLOT_LABELS } from '../types';

interface DraftRoomProps {
  leagueId: number;
}

interface ActivityItem {
  id: string;
  type: 'pick' | 'join' | 'leave' | 'start' | 'complete';
  message: string;
  timestamp: Date;
  isAutoPick?: boolean;
}

type SlotFilter = 'ALL' | ConferenceSlot;

export function DraftRoom({ leagueId }: DraftRoomProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Draft state from socket (ref mirrors state so socket handlers never go stale)
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const draftStateRef = useRef<DraftState | null>(null);
  useEffect(() => {
    draftStateRef.current = draftState;
  }, [draftState]);

  // Timer state
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<Date | null>(null);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [slotFilter, setSlotFilter] = useState<SlotFilter>('ALL');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);

  // Get available teams from REST API (fallback + initial load)
  const { data: availableTeams } = useQuery({
    queryKey: ['availableTeams', leagueId],
    queryFn: () => draftApi.getAvailableTeams(leagueId),
    refetchInterval: isConnected ? false : 2000, // Only poll if not connected
  });

  // Get league info for commissioner check
  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  const currentLeague = leagues?.find(l => l.id === leagueId);
  const isCommissioner = currentLeague?.isCommissioner ?? false;

  // Get user's queue
  const { data: userQueue } = useQuery({
    queryKey: ['draftQueue', leagueId],
    queryFn: () => draftApi.getQueue(leagueId),
    enabled: !!user,
  });

  // Initialize queue from server
  useEffect(() => {
    if (userQueue) {
      setQueue(userQueue.map((q: any) => q.teamId));
    }
  }, [userQueue]);

  // Add activity item
  const addActivity = useCallback((item: Omit<ActivityItem, 'id' | 'timestamp'>) => {
    const newItem: ActivityItem = {
      ...item,
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
    };
    setActivity(prev => [newItem, ...prev].slice(0, 50)); // Keep last 50
  }, []);

  // Update timer countdown
  const updateTimer = useCallback(() => {
    if (deadlineRef.current) {
      const remaining = Math.max(0, deadlineRef.current.getTime() - Date.now());
      setTimeRemaining(remaining);
    }
  }, []);

  // Connect to socket
  useEffect(() => {
    const token = localStorage.getItem('pick6_token');
    if (!token) {
      setConnectionError('Not authenticated');
      return;
    }

    connectToDraft(leagueId, token, {
      onConnect: () => {
        setIsConnected(true);
        setConnectionError(null);
        addActivity({ type: 'join', message: 'Connected to draft room' });
      },

      onDisconnect: () => {
        setIsConnected(false);
        addActivity({ type: 'leave', message: 'Disconnected from draft room' });
      },

      onState: (state) => {
        setDraftState(state);
        if (state.pickDeadline) {
          deadlineRef.current = new Date(state.pickDeadline);
          updateTimer();
        }
        // Invalidate queries to sync REST data
        queryClient.invalidateQueries({ queryKey: ['availableTeams', leagueId] });
        queryClient.invalidateQueries({ queryKey: ['draftPicks', leagueId] });
      },

      onPickMade: (event) => {
        const { pick, isAutoPick } = event;
        addActivity({
          type: 'pick',
          message: `${pick.userName} ${isAutoPick ? '(auto)' : ''} picked ${pick.teamName} (${SLOT_LABELS[pick.teamSlot]})`,
          isAutoPick,
        });

        // Update local state (full draft:state follows from the server)
        setDraftState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            picks: [...prev.picks, pick],
            currentPickNumber: prev.currentPickNumber + 1,
            onTheClockUserId: event.nextOnClock?.userId ?? null,
            draftComplete: event.isComplete,
            draftStatus: event.isComplete ? 'COMPLETE' : prev.draftStatus,
            members: prev.members.map(m =>
              m.userId === pick.userId
                ? { ...m, filledSlots: [...m.filledSlots, pick.teamSlot] }
                : m
            ),
          };
        });

        // Clear selection if the picked team was selected (functional read, no stale closure)
        setSelectedTeam(prev => (prev?.id === pick.teamId ? null : prev));

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['availableTeams', leagueId] });
      },

      onTimer: (timer) => {
        deadlineRef.current = new Date(timer.endsAt);
        setTimeRemaining(timer.msRemaining);
      },

      onStarted: () => {
        addActivity({ type: 'start', message: 'Draft has started!' });
      },

      onComplete: () => {
        addActivity({ type: 'complete', message: 'Draft is complete!' });
      },

      onUserJoined: (data) => {
        const member = draftStateRef.current?.members.find(m => m.userId === data.userId);
        addActivity({ type: 'join', message: `${member?.name || 'A player'} joined the draft room` });
      },

      onUserLeft: (data) => {
        const member = draftStateRef.current?.members.find(m => m.userId === data.userId);
        addActivity({ type: 'leave', message: `${member?.name || 'A player'} left the draft room` });
      },

      onQueueUpdated: (data) => {
        setQueue(data.teamIds);
      },

      onError: (error) => {
        setPickError(error.message);
        setTimeout(() => setPickError(null), 5000);
      },
    });

    // Start timer interval
    timerRef.current = setInterval(updateTimer, 100);

    return () => {
      disconnectFromDraft();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [leagueId, queryClient, addActivity, updateTimer]);

  // Handle making a pick
  const handleMakePick = () => {
    if (!selectedTeam) return;
    setPickError(null);
    socketMakePick(leagueId, selectedTeam.id);
  };

  // Handle starting draft (commissioner)
  const handleStartDraft = () => {
    socketStartDraft(leagueId);
  };

  // Handle queue update
  const handleAddToQueue = (teamId: number) => {
    const newQueue = [...queue, teamId];
    setQueue(newQueue);
    socketUpdateQueue(leagueId, newQueue);
  };

  const handleRemoveFromQueue = (teamId: number) => {
    const newQueue = queue.filter(id => id !== teamId);
    setQueue(newQueue);
    socketUpdateQueue(leagueId, newQueue);
  };

  // My filled slots (drives which teams I can still draft)
  const me = draftState?.members.find(m => m.userId === user?.id);
  const myFilledSlots = me?.filledSlots ?? [];

  const isSlotFilledForMe = (slot: ConferenceSlot) => myFilledSlots.includes(slot);

  // Filter available teams by search + slot chip
  const filteredTeams = availableTeams?.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (slotFilter === 'ALL' || team.slot === slotFilter) &&
    !draftState?.picks.some(p => p.teamId === team.id)
  ) || [];

  // Check if it's user's turn
  const isMyTurn = draftState?.onTheClockUserId === user?.id;

  // Get user on clock name
  const userOnClock = draftState?.members.find(m => m.userId === draftState.onTheClockUserId);

  const totalRounds = draftState?.rounds ?? DRAFT_SLOTS.length;

  // Format time remaining
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get draft status display
  const getStatusDisplay = () => {
    if (!draftState) return 'Loading...';
    switch (draftState.draftStatus) {
      case 'NOT_STARTED':
        return 'Not Started';
      case 'SCHEDULED':
        return `Scheduled for ${new Date(draftState.draftScheduledAt!).toLocaleString()}`;
      case 'LIVE':
        return 'LIVE';
      case 'COMPLETE':
        return 'Complete';
      default:
        return draftState.draftStatus;
    }
  };

  // Get pick for a board cell (snake order)
  const getPickForCell = (round: number, position: number) => {
    const memberCount = draftState?.members.length || 0;
    if (memberCount === 0) return null;

    let pickNumber: number;
    if (round % 2 === 1) {
      // Odd round: forward
      pickNumber = (round - 1) * memberCount + position;
    } else {
      // Even round: reverse
      pickNumber = (round - 1) * memberCount + (memberCount - position + 1);
    }

    return draftState?.picks.find(p => p.pickNumber === pickNumber);
  };

  // Render loading state
  if (!draftState) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-600 mb-4"></div>
          <p className="text-gray-600">Connecting to draft room...</p>
          {connectionError && <ErrorMessage message={connectionError} />}
        </div>
      </div>
    );
  }

  // Render pre-draft state
  if (draftState.draftStatus === 'NOT_STARTED' || draftState.draftStatus === 'SCHEDULED') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Draft Room</h2>

          <div className="mb-6">
            <span className={`inline-block px-4 py-2 rounded-full font-semibold ${
              draftState.draftStatus === 'SCHEDULED'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {getStatusDisplay()}
            </span>
          </div>

          <div className="mb-6 text-gray-600 text-sm">
            <p className="mb-2">
              {totalRounds} rounds — one team from each slot:
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {DRAFT_SLOTS.map(slot => (
                <span key={slot} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                  {SLOT_LABELS[slot]}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <p className="text-gray-600 mb-2">
              {draftState.members.length} members ready
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {draftState.members.map(member => (
                <span key={member.userId} className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  {member.name}
                </span>
              ))}
            </div>
          </div>

          {isCommissioner && draftState.draftStatus !== 'SCHEDULED' && (
            <button
              onClick={handleStartDraft}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
            >
              Start Draft Now
            </button>
          )}

          {draftState.draftStatus === 'SCHEDULED' && (
            <p className="text-sm text-gray-500 mt-4">
              Draft will start automatically at the scheduled time
            </p>
          )}

          {/* Connection status */}
          <div className="mt-6 flex items-center justify-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <span className="text-gray-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Render complete state
  if (draftState.draftStatus === 'COMPLETE') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow p-8 text-center mb-6">
          <h2 className="text-2xl font-bold text-green-800 mb-4">Draft Complete!</h2>
          <p className="text-gray-600">All teams have been drafted. See the Draft Recap tab for rosters by slot.</p>
        </div>

        {/* Final Draft Board */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="bg-green-600 text-white p-4">
            <h3 className="text-lg font-bold">Final Draft Results</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-gray-600 font-semibold">Round</th>
                  {draftState.members.map(member => (
                    <th key={member.userId} className="p-3 text-left text-gray-600 font-semibold">
                      {member.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: totalRounds }).map((_, roundIndex) => (
                  <tr key={roundIndex} className={roundIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3 font-bold text-gray-800">{roundIndex + 1}</td>
                    {draftState.members.map((member, posIndex) => {
                      const pick = getPickForCell(roundIndex + 1, posIndex + 1);
                      return (
                        <td key={member.userId} className="p-3">
                          {pick ? (
                            <div className={`p-2 rounded ${
                              pick.userId === user?.id ? 'bg-green-100' : 'bg-gray-100'
                            }`}>
                              <div className="font-semibold text-sm">{pick.teamName}</div>
                              <div className="text-xs text-gray-500">{SLOT_LABELS[pick.teamSlot]}</div>
                              {pick.wasAutoPick && (
                                <span className="text-xs text-orange-600">(auto)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Render LIVE draft
  return (
    <div className="p-4 space-y-4">
      {/* Header with Timer */}
      <div className={`bg-white rounded-lg shadow p-4 ${isMyTurn ? 'ring-2 ring-green-500' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
              <span className="font-bold text-red-600">LIVE</span>
            </div>
            <p className="text-gray-600 text-sm mt-1">
              Pick {draftState.currentPickNumber} of {draftState.totalPicks}
              {' '}(Round {draftState.currentRound})
            </p>
          </div>

          {/* Timer */}
          <div className="text-center">
            <div className={`text-4xl font-mono font-bold ${
              timeRemaining < 10000 ? 'text-red-600 animate-pulse' : 'text-green-700'
            }`}>
              {formatTime(timeRemaining)}
            </div>
            <p className="text-sm text-gray-500">Time Remaining</p>
          </div>

          {/* On the Clock */}
          <div className="text-right">
            <p className="text-sm text-gray-500">On the Clock</p>
            <p className={`text-xl font-bold ${isMyTurn ? 'text-green-600' : 'text-gray-800'}`}>
              {isMyTurn ? "IT'S YOUR TURN!" : userOnClock?.name || 'Unknown'}
            </p>
          </div>
        </div>

        {/* Connection status */}
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-gray-400">
            {isConnected ? 'Connected' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      {/* Error display */}
      {pickError && <ErrorMessage message={pickError} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content - Draft Board + Team Selection */}
        <div className="lg:col-span-2 space-y-4">
          {/* Pick Interface (only when it's your turn) */}
          {isMyTurn && (
            <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4">
              <h3 className="font-bold text-green-800 mb-1">Make Your Pick</h3>
              <p className="text-xs text-green-700 mb-3">
                Open slots:{' '}
                {DRAFT_SLOTS.filter(s => !isSlotFilledForMe(s)).map(s => SLOT_LABELS[s]).join(', ')}
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search teams..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedTeam(null);
                    }}
                    className="w-full p-3 border-2 border-green-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  {searchTerm && filteredTeams.length > 0 && !selectedTeam && (
                    <div className="absolute z-20 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg">
                      {filteredTeams.slice(0, 15).map(team => {
                        const slotFilled = isSlotFilledForMe(team.slot);
                        return (
                          <div
                            key={team.id}
                            onClick={() => {
                              if (slotFilled) return;
                              setSelectedTeam(team);
                              setSearchTerm(team.name);
                            }}
                            className={`p-3 border-b last:border-b-0 ${
                              slotFilled
                                ? 'opacity-40 cursor-not-allowed'
                                : 'hover:bg-green-50 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{team.name}</div>
                              <span className="text-xs font-semibold text-gray-500">{SLOT_LABELS[team.slot]}</span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {team.conference}
                              {slotFilled && ' — slot filled'}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleMakePick}
                  disabled={!selectedTeam}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  Draft
                </button>
              </div>
            </div>
          )}

          {/* Draft Board Grid */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-green-600 text-white p-3">
              <h3 className="font-bold">Draft Board</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left text-gray-600 font-semibold sticky left-0 bg-gray-50">Rd</th>
                    {draftState.members.map(member => (
                      <th
                        key={member.userId}
                        className={`p-2 text-left font-semibold ${
                          member.userId === draftState.onTheClockUserId
                            ? 'bg-green-100 text-green-800'
                            : 'text-gray-600'
                        }`}
                      >
                        {member.name}
                        {member.userId === user?.id && ' (You)'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: totalRounds }).map((_, roundIndex) => (
                    <tr key={roundIndex} className={roundIndex % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-2 font-bold text-gray-800 sticky left-0 bg-inherit">{roundIndex + 1}</td>
                      {draftState.members.map((member, posIndex) => {
                        const round = roundIndex + 1;
                        const position = posIndex + 1;
                        const pick = getPickForCell(round, position);
                        const memberCount = draftState.members.length;
                        const cellPickNumber = round % 2 === 1
                          ? (round - 1) * memberCount + position
                          : (round - 1) * memberCount + (memberCount - position + 1);
                        const isCurrentPick = draftState.currentPickNumber === cellPickNumber;
                        return (
                          <td
                            key={member.userId}
                            className={`p-2 ${
                              isCurrentPick && !pick ? 'bg-yellow-100 ring-2 ring-yellow-400' : ''
                            }`}
                          >
                            {pick ? (
                              <div className={`p-1.5 rounded text-xs ${
                                pick.userId === user?.id ? 'bg-green-100' : 'bg-gray-100'
                              }`}>
                                <div className="font-semibold truncate">{pick.teamName}</div>
                                <div className="text-gray-500">{SLOT_LABELS[pick.teamSlot]}</div>
                                {pick.wasAutoPick && (
                                  <span className="text-orange-600">(auto)</span>
                                )}
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
          </div>

          {/* Available Teams */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-100 p-3 flex flex-wrap justify-between items-center gap-2">
              <h3 className="font-bold text-gray-800">Available Teams ({filteredTeams.length})</h3>
              <input
                type="text"
                placeholder="Filter..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="px-3 py-1 border rounded text-sm w-40"
              />
            </div>
            {/* Slot filter chips */}
            <div className="px-3 py-2 border-b flex flex-wrap gap-2">
              {(['ALL', ...DRAFT_SLOTS] as SlotFilter[]).map(slot => (
                <button
                  key={slot}
                  onClick={() => setSlotFilter(slot)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    slotFilter === slot
                      ? 'bg-green-600 text-white'
                      : isSlotFilledForMe(slot as ConferenceSlot)
                      ? 'bg-gray-100 text-gray-400 line-through'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {slot === 'ALL' ? 'All' : SLOT_LABELS[slot as ConferenceSlot]}
                </button>
              ))}
            </div>
            <div className="max-h-64 overflow-y-auto p-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {filteredTeams.map(team => {
                const slotFilled = isSlotFilledForMe(team.slot);
                const blocked = isMyTurn && slotFilled;
                return (
                  <button
                    key={team.id}
                    disabled={blocked}
                    onClick={() => {
                      if (isMyTurn) {
                        setSelectedTeam(team);
                        setSearchTerm(team.name);
                      } else {
                        handleAddToQueue(team.id);
                      }
                    }}
                    title={blocked ? `${SLOT_LABELS[team.slot]} slot already filled` : undefined}
                    className={`p-2 text-left rounded text-sm transition-colors ${
                      blocked
                        ? 'bg-gray-50 opacity-40 cursor-not-allowed'
                        : 'hover:bg-green-50'
                    } ${
                      selectedTeam?.id === team.id ? 'bg-green-100 ring-2 ring-green-500' : 'bg-gray-50'
                    } ${queue.includes(team.id) ? 'border-2 border-blue-400' : ''}`}
                  >
                    <div className="font-medium truncate">{team.name}</div>
                    <div className="text-xs text-gray-500">{SLOT_LABELS[team.slot]}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar - Activity + Queue + Roster */}
        <div className="space-y-4">
          {/* Activity Feed */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-gray-100 p-3">
              <h3 className="font-bold text-gray-800">Activity</h3>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {activity.length === 0 ? (
                <p className="p-4 text-gray-400 text-center text-sm">No activity yet</p>
              ) : (
                <div className="divide-y">
                  {activity.map(item => (
                    <div key={item.id} className="p-3 text-sm">
                      <p className={`${
                        item.type === 'pick' ? 'text-green-700' :
                        item.type === 'start' ? 'text-blue-700' :
                        item.type === 'complete' ? 'text-purple-700' :
                        'text-gray-600'
                      }`}>
                        {item.message}
                      </p>
                      <p className="text-xs text-gray-400">
                        {item.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Queue Management */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <button
              onClick={() => setShowQueue(!showQueue)}
              className="w-full bg-gray-100 p-3 flex justify-between items-center"
            >
              <h3 className="font-bold text-gray-800">My Queue ({queue.length})</h3>
              <span className="text-gray-500">{showQueue ? '▼' : '▶'}</span>
            </button>
            {showQueue && (
              <div className="max-h-48 overflow-y-auto">
                {queue.length === 0 ? (
                  <p className="p-4 text-gray-400 text-center text-sm">
                    Click on available teams to add to queue
                  </p>
                ) : (
                  <div className="divide-y">
                    {queue.map((teamId, index) => {
                      const team = availableTeams?.find(t => t.id === teamId);
                      const drafted = draftState.picks.some(p => p.teamId === teamId);
                      const slotFilled = team ? isSlotFilledForMe(team.slot) : false;
                      return (
                        <div
                          key={teamId}
                          className={`p-2 flex items-center justify-between ${
                            drafted || slotFilled ? 'opacity-40' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm">{index + 1}.</span>
                            <div>
                              <span className="font-medium text-sm">
                                {team?.name || 'Drafted team'}
                              </span>
                              {team && (
                                <span className="text-xs text-gray-400 ml-1">
                                  {SLOT_LABELS[team.slot]}
                                  {slotFilled && ' (slot filled)'}
                                </span>
                              )}
                              {drafted && (
                                <span className="text-xs text-red-400 ml-1">(taken)</span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveFromQueue(teamId)}
                            className="text-red-500 hover:text-red-700 text-sm px-2"
                          >
                            &times;
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            <p className="p-2 text-xs text-gray-500 bg-gray-50">
              Queue auto-picks if timer expires (skips filled slots)
            </p>
          </div>

          {/* Your Roster by Slot */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="bg-green-600 text-white p-3">
              <h3 className="font-bold">
                Your Roster ({myFilledSlots.length}/{DRAFT_SLOTS.length})
              </h3>
            </div>
            <div className="divide-y">
              {DRAFT_SLOTS.map(slot => {
                const pick = draftState.picks.find(
                  p => p.userId === user?.id && p.teamSlot === slot
                );
                return (
                  <div key={slot} className="p-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 w-24">
                      {SLOT_LABELS[slot]}
                    </span>
                    {pick ? (
                      <div className="text-right">
                        <div className="font-semibold text-sm">{pick.teamName}</div>
                        <div className="text-xs text-gray-500">
                          Rd {pick.round}, Pick #{pick.pickNumber}
                          {pick.wasAutoPick && <span className="text-orange-600 ml-1">(auto)</span>}
                        </div>
                      </div>
                    ) : (
                      <span className="text-gray-300 text-sm">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
