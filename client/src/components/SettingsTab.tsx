import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretUp, CaretDown, ShareNetwork } from '@phosphor-icons/react';
import { leagueApi, adminApi, swapApi, authApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';
import { Button } from './Button';
import { Input } from './Input';

interface SettingsTabProps {
  leagueId: number;
}

// Local-timezone YYYY-MM-DD. Never toISOString() for date inputs: the UTC
// date is already "tomorrow" during the local evening, which greys out today
// in the calendar picker.
function toLocalDateString(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function SettingsTab({ leagueId }: SettingsTabProps) {
  const { user, updateUser } = useAuth();
  const queryClient = useQueryClient();

  // Get league info including commissioner status
  const { data: leagues } = useQuery({
    queryKey: ['myLeagues'],
    queryFn: () => leagueApi.getMyLeagues(),
  });

  const currentLeague = leagues?.find(l => l.id === leagueId);
  const isCommissioner = currentLeague?.isCommissioner ?? false;

  // Draft settings state
  const [draftDate, setDraftDate] = useState('');
  const [draftTime, setDraftTime] = useState('');
  const [pickDeadline, setPickDeadline] = useState(90);
  const [orderMode, setOrderMode] = useState<'random' | 'manual'>('random');
  const [manualOrder, setManualOrder] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [swapMessage, setSwapMessage] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  // Your Profile (every member, not just the commissioner)
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  // Swap window state + commissioner open/close
  const { data: swapState } = useQuery({
    queryKey: ['swapState', leagueId],
    queryFn: () => swapApi.getState(leagueId),
  });

  const swapWindowMutation = useMutation({
    mutationFn: (action: 'open' | 'close') =>
      action === 'open' ? swapApi.open(leagueId) : swapApi.close(leagueId),
    onSuccess: (state) => {
      setSwapMessage(
        state.status === 'OPEN'
          ? 'Swap window is open. Turn order is posted in My Team.'
          : 'Swap window closed.'
      );
      queryClient.invalidateQueries({ queryKey: ['swapState', leagueId] });
    },
    onError: (err: any) => {
      setSwapMessage(err.response?.data?.message || 'Swap window change failed');
    },
  });

  // Manual "sync now" (commissioner) — the scheduled cron does this automatically
  const syncMutation = useMutation({
    mutationFn: () => adminApi.syncWeek(leagueId, currentLeague!.currentWeek),
    onSuccess: (data: any) => {
      const warnings = data.errors?.length ? `, ${data.errors.length} warnings` : '';
      setSyncResult(
        `Week ${data.weekNumber}: ${data.gamesCreated} games synced, ${data.oddsUpdated} odds updated, ${data.scoresCalculated} members rescored${warnings}`
      );
      queryClient.invalidateQueries({ queryKey: ['weeklyStandings'] });
      queryClient.invalidateQueries({ queryKey: ['overallStandings'] });
      queryClient.invalidateQueries({ queryKey: ['allMatchups', leagueId] });
    },
    onError: (err: any) => {
      setSyncResult(err.response?.data?.message || 'Sync failed');
    },
  });

  // Keep the profile field in sync with the signed-in user
  useEffect(() => {
    if (user?.name) setProfileName(user.name);
  }, [user?.name]);

  // Initialize form with current values
  useEffect(() => {
    if (currentLeague) {
      if (currentLeague.draftScheduledAt) {
        // Local components, NOT toISOString(): the UTC date can be a day
        // ahead of the local evening, which silently moved re-saved drafts
        const date = new Date(currentLeague.draftScheduledAt);
        const pad = (n: number) => n.toString().padStart(2, '0');
        setDraftDate(toLocalDateString(date));
        setDraftTime(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
      }
      // Seed the manual-order list: assigned order if one exists, join order otherwise
      const members = [...(currentLeague.members || [])];
      const hasOrder = members.some(m => m.draftPosition !== null);
      if (hasOrder) {
        members.sort((a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99));
      }
      setManualOrder(members.map(m => m.id));
    }
  }, [currentLeague]);

  const memberName = (userId: number) =>
    currentLeague?.members?.find(m => m.id === userId)?.name || 'Unknown';

  const moveMember = (index: number, direction: -1 | 1) => {
    setManualOrder(prev => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Share a join link: native share sheet on phones, clipboard elsewhere.
  // The link presets the code on /league/join; new folks still sign up first.
  const handleShareJoinLink = async () => {
    if (!currentLeague) return;
    const url = `${window.location.origin}/league/join?code=${currentLeague.joinCode}`;
    const copyLink = async () => {
      await navigator.clipboard.writeText(url);
      setShareFeedback('Link copied');
      setTimeout(() => setShareFeedback(null), 2500);
    };
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Pick 6',
          text: `Join my Pick 6 league "${currentLeague.name}" with code ${currentLeague.joinCode}`,
          url,
        });
        return;
      }
      await copyLink();
    } catch (err: any) {
      if (err?.name === 'AbortError') return; // user closed the share sheet
      try {
        await copyLink();
      } catch {
        setShareFeedback(url); // clipboard blocked: show the link itself
      }
    }
  };

  // Save profile name mutation (any member)
  const updateProfileMutation = useMutation({
    mutationFn: (name: string) => authApi.updateMe(name),
    onSuccess: (updated) => {
      updateUser(updated);
      setProfileName(updated.name);
      setProfileMessage('Name updated.');
      // Names show on every tab (leaderboard, board, rosters): refresh all
      queryClient.invalidateQueries();
      setTimeout(() => setProfileMessage(null), 3000);
    },
    onError: (err: any) => {
      setProfileMessage(err.response?.data?.message || 'Failed to update name');
    },
  });

  // Update settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: {
      draftScheduledAt?: string | null;
      pickDeadlineSeconds?: number;
      draftOrder?: number[] | 'randomize';
    }) => {
      return leagueApi.updateSettings(leagueId, settings);
    },
    onSuccess: () => {
      setSuccess('Settings saved successfully!');
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['myLeagues'] });
      queryClient.invalidateQueries({ queryKey: ['league', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['draftState', leagueId] });
      setTimeout(() => setSuccess(null), 3000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to save settings');
      setSuccess(null);
    },
  });

  const handleScheduleDraft = () => {
    if (!draftDate || !draftTime) {
      setError('Please select both date and time');
      return;
    }

    const scheduledAt = new Date(`${draftDate}T${draftTime}`);
    if (scheduledAt <= new Date()) {
      setError('Draft must be scheduled in the future');
      return;
    }

    updateSettingsMutation.mutate({
      draftScheduledAt: scheduledAt.toISOString(),
      pickDeadlineSeconds: pickDeadline,
      // Random mode leaves draftOrder unset: the server randomizes on first
      // schedule and keeps an existing order after that
      draftOrder: orderMode === 'manual' ? manualOrder : undefined,
    });
  };

  const handleShuffleOrder = () => {
    updateSettingsMutation.mutate({ draftOrder: 'randomize' });
  };

  const handleClearSchedule = () => {
    updateSettingsMutation.mutate({
      draftScheduledAt: null,
    });
    setDraftDate('');
    setDraftTime('');
  };

  const formatScheduledTime = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  };

  if (!currentLeague) return <Loading inline />;

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-4 sm:mb-6">
        <h2 className="section-title">Settings</h2>
        <p className="section-sub">{currentLeague.name}</p>
      </div>

      {/* League Info */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <span className="label">Join code</span>
            <div className="flex items-center gap-2">
              <p className="font-mono font-bold text-lg tracking-widest text-gray-900">{currentLeague.joinCode}</p>
              <button
                onClick={handleShareJoinLink}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full text-green-800 hover:text-green-900 hover:bg-green-50 active:bg-green-100"
                title="Share a join link"
                aria-label="Share a join link"
              >
                <ShareNetwork size={18} weight="bold" />
              </button>
            </div>
          </div>
          <div>
            <span className="label">Season</span>
            <p className="font-display font-bold text-lg text-gray-900">{currentLeague.seasonYear}</p>
          </div>
          <div>
            <span className="label">Players</span>
            <p className="font-display font-bold text-lg text-gray-900">{currentLeague.memberCount}/{currentLeague.maxPlayers}</p>
          </div>
          <div>
            <span className="label">Week</span>
            <p className="font-display font-bold text-lg text-gray-900">{currentLeague.currentWeek}</p>
          </div>
        </div>
        {shareFeedback && (
          <p className="mt-3 text-sm text-green-800 break-all">{shareFeedback}</p>
        )}
      </div>

      {/* Your Profile (every member) */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900 mb-1">Your Profile</h3>
        <p className="text-sm text-gray-600 mb-4">
          Signed in as <span className="font-semibold">{user?.email}</span>. Your name shows on the leaderboard and draft board.
        </p>
        {profileMessage && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
            {profileMessage}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          <div className="flex-1 max-w-sm">
            <Input
              label="Name"
              type="text"
              autoComplete="name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              required
            />
          </div>
          <Button
            onClick={() => updateProfileMutation.mutate(profileName)}
            disabled={
              updateProfileMutation.isPending ||
              !profileName.trim() ||
              profileName.trim().replace(/\s+/g, ' ') === user?.name
            }
          >
            {updateProfileMutation.isPending ? 'Saving...' : 'Save name'}
          </Button>
        </div>
      </div>

      {/* Draft Status */}
      <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
        <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900 mb-3">Draft Status</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full font-display font-semibold uppercase tracking-wider text-xs border ${
              currentLeague.draftStatus === 'COMPLETE' ? 'bg-green-50 text-green-800 border-green-200' :
              currentLeague.draftStatus === 'LIVE' ? 'bg-red-600 text-white border-red-600 animate-pulse' :
              currentLeague.draftStatus === 'SCHEDULED' ? 'bg-amber-50 text-amber-800 border-amber-200' :
              'bg-gray-100 text-gray-700 border-gray-200'
            }`}>
              {currentLeague.draftStatus === 'NOT_STARTED' ? 'Not Scheduled' :
               currentLeague.draftStatus === 'SCHEDULED' ? 'Scheduled' :
               currentLeague.draftStatus === 'LIVE' ? 'LIVE' :
               currentLeague.draftStatus === 'COMPLETE' ? 'Complete' :
               currentLeague.draftStatus}
            </span>
          </div>
          {currentLeague.draftScheduledAt && currentLeague.draftStatus === 'SCHEDULED' && (
            <p className="text-gray-600">
              Scheduled for: <span className="font-semibold">{formatScheduledTime(currentLeague.draftScheduledAt)}</span>
            </p>
          )}
        </div>
      </div>

      {/* Commissioner: manual sync */}
      {isCommissioner && (
        <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="label text-amber-700">Commissioner</span>
            <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Scoring</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Scores sync automatically on a schedule. Use this to pull games, odds,
            and scores for week {currentLeague.currentWeek} right now.
          </p>
          {syncResult && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              {syncResult}
            </div>
          )}
          <Button
            variant="blue"
            onClick={() => {
              setSyncResult(null);
              syncMutation.mutate();
            }}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Syncing...' : `Sync Week ${currentLeague.currentWeek} Now`}
          </Button>
        </div>
      )}

      {/* Commissioner: week-5 swap window */}
      {isCommissioner && (
        <div className="card p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="label text-amber-700">Commissioner</span>
            <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Week 5 Swap Window</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Opens automatically once week 5 wraps. Status:{' '}
            <span className="font-semibold">
              {swapState?.status === 'OPEN'
                ? 'OPEN'
                : swapState?.status === 'CLOSED'
                ? 'CLOSED'
                : 'Not opened yet'}
            </span>
          </p>
          {swapMessage && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
              {swapMessage}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {swapState?.status === 'NOT_OPEN' && (
              <Button
                variant="amber"
                onClick={() => swapWindowMutation.mutate('open')}
                disabled={swapWindowMutation.isPending}
              >
                Open swap window now
              </Button>
            )}
            {swapState?.status === 'OPEN' && (
              <Button
                variant="secondary"
                onClick={() => swapWindowMutation.mutate('close')}
                disabled={swapWindowMutation.isPending}
              >
                Close swap window
              </Button>
            )}
            {swapState?.status === 'CLOSED' && (
              <p className="text-sm text-gray-500">The window is closed for the season.</p>
            )}
          </div>
        </div>
      )}

      {/* Commissioner Settings */}
      {isCommissioner ? (
        <div className="card p-4 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className="label text-amber-700">Commissioner</span>
            <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900">Draft Settings</h3>
          </div>

          {error && <ErrorMessage message={error} />}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              {success}
            </div>
          )}

          {currentLeague.draftStatus === 'COMPLETE' ? (
            <p className="text-gray-600">Draft is complete. Settings cannot be changed.</p>
          ) : currentLeague.draftStatus === 'LIVE' ? (
            <p className="text-gray-600">Draft is in progress. Settings cannot be changed.</p>
          ) : (
            <div className="space-y-6">
              {/* Schedule Draft */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Schedule Draft</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">Date</label>
                    <input
                      type="date"
                      value={draftDate}
                      onChange={(e) => setDraftDate(e.target.value)}
                      min={toLocalDateString(new Date())}
                      className="w-full px-3.5 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-1.5">Time</label>
                    <input
                      type="time"
                      value={draftTime}
                      onChange={(e) => setDraftTime(e.target.value)}
                      className="w-full px-3.5 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Draft will automatically start at the scheduled time
                </p>
              </div>

              {/* Pick Timer */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Time Per Pick</h4>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="30"
                    max="300"
                    step="15"
                    value={pickDeadline}
                    onChange={(e) => setPickDeadline(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <span className="font-display text-2xl font-bold text-green-700 w-20 text-right">
                    {pickDeadline}s
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>30 seconds</span>
                  <span>5 minutes</span>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Auto-pick triggers when timer expires
                </p>
              </div>

              {/* Draft Order */}
              <div>
                <h4 className="font-semibold text-gray-900 mb-1">Draft Order</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Set when you schedule the draft, so everyone sees it in the lobby.
                  Snake order: round 2 reverses.
                </p>
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="orderMode"
                      checked={orderMode === 'random'}
                      onChange={() => setOrderMode('random')}
                      className="accent-green-700"
                    />
                    Random
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-800 cursor-pointer">
                    <input
                      type="radio"
                      name="orderMode"
                      checked={orderMode === 'manual'}
                      onChange={() => setOrderMode('manual')}
                      className="accent-green-700"
                    />
                    Set manually
                  </label>
                </div>
                {orderMode === 'manual' && (
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-3">
                    {manualOrder.map((userId, index) => (
                      <div key={userId} className="p-2 flex items-center gap-3">
                        <span className="font-display font-bold text-lg text-gray-400 w-6 text-center">{index + 1}</span>
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                          {memberName(userId)}
                          {userId === user?.id && ' (You)'}
                        </span>
                        <button
                          onClick={() => moveMember(index, -1)}
                          disabled={index === 0}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                          aria-label={`Move ${memberName(userId)} up`}
                        >
                          <CaretUp size={16} weight="bold" />
                        </button>
                        <button
                          onClick={() => moveMember(index, 1)}
                          disabled={index === manualOrder.length - 1}
                          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                          aria-label={`Move ${memberName(userId)} down`}
                        >
                          <CaretDown size={16} weight="bold" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {currentLeague.draftStatus === 'SCHEDULED' && (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleShuffleOrder}
                      disabled={updateSettingsMutation.isPending}
                    >
                      Shuffle order now
                    </Button>
                    <span className="text-xs text-gray-500">
                      Players see the new order in the lobby right away
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-200">
                <Button
                  className="sm:flex-1"
                  onClick={handleScheduleDraft}
                  disabled={updateSettingsMutation.isPending || !draftDate || !draftTime}
                >
                  {updateSettingsMutation.isPending ? 'Saving...' : 'Save & Schedule Draft'}
                </Button>
                {currentLeague.draftScheduledAt && (
                  <Button
                    variant="secondary"
                    onClick={handleClearSchedule}
                    disabled={updateSettingsMutation.isPending}
                  >
                    Clear Schedule
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-4 sm:p-6">
          <h3 className="font-display font-bold uppercase tracking-wide text-xl text-gray-900 mb-2">Commissioner Settings</h3>
          <p className="text-gray-600">
            Only the league commissioner can modify draft settings.
          </p>
          {currentLeague.members && (
            <p className="text-sm text-gray-500 mt-2">
              Commissioner: {currentLeague.members.find(m => m.role === 'COMMISSIONER')?.name || 'Unknown'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
