import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  auctionApi,
  rosterApi,
  AuctionState,
  AuctionAvailableTeam,
  AuctionBid,
  RosterTeam,
  WaiverPriority,
} from '../services/api';

interface AuctionTabProps {
  leagueId: number;
  isCommissioner: boolean;
}

export function AuctionTab({ leagueId, isCommissioner }: AuctionTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<AuctionAvailableTeam | null>(null);
  const [selectedDropTeam, setSelectedDropTeam] = useState<number | null>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showTiebreaker, setShowTiebreaker] = useState(false);

  // Setup form state
  const [setupWeek, setSetupWeek] = useState<string>('7');
  const [setupOpens, setSetupOpens] = useState<string>('');
  const [setupCloses, setSetupCloses] = useState<string>('');

  // Fetch auction state
  const { data: auctionState, isLoading: loadingState } = useQuery({
    queryKey: ['auctionState', leagueId],
    queryFn: () => auctionApi.getAuctionState(leagueId),
    // Only poll frequently when auction is open (active bidding)
    // Poll every 30s when scheduled, no polling when complete or no auction
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data?.hasAuction) return false; // No polling if no auction
      if (data.status === 'OPEN') return 5000; // Poll every 5s during bidding
      if (data.status === 'SCHEDULED') return 30000; // Poll every 30s while waiting
      return false; // No polling when complete or finalizing
    },
  });

  // Fetch available teams
  const { data: availableTeams = [] } = useQuery({
    queryKey: ['auctionAvailableTeams', leagueId],
    queryFn: () => auctionApi.getAvailableTeams(leagueId),
    enabled: auctionState?.hasAuction === true,
    refetchInterval: 30000,
  });

  // Fetch user's roster
  const { data: myRoster = [] } = useQuery({
    queryKey: ['auctionMyRoster', leagueId],
    queryFn: () => rosterApi.getMyRoster(leagueId),
    enabled: auctionState?.hasAuction === true,
  });

  // Fetch tiebreaker priority (waiver priority based on standings)
  const { data: waiverPriority = [] } = useQuery({
    queryKey: ['waiverPriority', leagueId],
    queryFn: () => rosterApi.getWaiverPriority(leagueId),
  });

  // Get current user's priority
  const myPriority = waiverPriority.find((p) => p.userId === user?.id);

  // Helper to convert datetime-local value to ISO string
  const parseLocalDateTime = (value: string): string => {
    if (!value) throw new Error('Date/time is required');
    // datetime-local gives "YYYY-MM-DDTHH:mm", add seconds for proper parsing
    const dateStr = value.includes(':') && value.split(':').length === 2
      ? `${value}:00`
      : value;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) throw new Error('Invalid date/time format');
    return date.toISOString();
  };

  // Create auction mutation
  const createAuctionMutation = useMutation({
    mutationFn: async () => {
      const opensAtISO = parseLocalDateTime(setupOpens);
      const closesAtISO = parseLocalDateTime(setupCloses);
      return auctionApi.createAuction(leagueId, parseInt(setupWeek), opensAtISO, closesAtISO);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auctionState', leagueId] });
      setError(null);
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create auction';
      setError(errorMsg);
    },
  });

  // Place bid mutation
  const placeBidMutation = useMutation({
    mutationFn: ({
      addTeamId,
      dropTeamId,
      amount,
    }: {
      addTeamId: number;
      dropTeamId: number;
      amount: number;
    }) => auctionApi.placeBid(leagueId, addTeamId, dropTeamId, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auctionState', leagueId] });
      setSelectedTeam(null);
      setSelectedDropTeam(null);
      setBidAmount('');
      setError(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to place bid');
    },
  });

  // Cancel bid mutation
  const cancelBidMutation = useMutation({
    mutationFn: (bidId: number) => auctionApi.cancelBid(leagueId, bidId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auctionState', leagueId] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Failed to cancel bid');
    },
  });

  // Filter teams
  const filteredTeams = useMemo(() => {
    if (!searchTerm) return availableTeams;
    const term = searchTerm.toLowerCase();
    return availableTeams.filter(
      (t) =>
        t.name.toLowerCase().includes(term) ||
        t.abbreviation?.toLowerCase().includes(term) ||
        t.conference.toLowerCase().includes(term)
    );
  }, [availableTeams, searchTerm]);

  // Get high bid map
  const highBidMap = useMemo(() => {
    const map = new Map<number, { highBid: number; bidCount: number }>();
    if (auctionState?.teamHighBids) {
      for (const bid of auctionState.teamHighBids) {
        map.set(bid.teamId, { highBid: bid.highBid, bidCount: bid.bidCount });
      }
    }
    return map;
  }, [auctionState?.teamHighBids]);

  // Get my active bids map
  const myActiveBidsMap = useMemo(() => {
    const map = new Map<number, AuctionBid>();
    if (auctionState?.myBids) {
      for (const bid of auctionState.myBids) {
        if (bid.status === 'ACTIVE') {
          map.set(bid.addTeamId, bid);
        }
      }
    }
    return map;
  }, [auctionState?.myBids]);

  // Countdown timer
  const [countdown, setCountdown] = useState<string>('');
  useEffect(() => {
    if (!auctionState?.closesAt) return;

    const updateCountdown = () => {
      const now = new Date();
      const closes = new Date(auctionState.closesAt!);
      const diff = closes.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown('Auction Closed');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [auctionState?.closesAt]);

  if (loadingState) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  // No auction exists - show setup form for commissioner
  if (!auctionState?.hasAuction) {
    return (
      <div className="p-6 space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">FAAB Auction</h2>
          {isCommissioner ? (
            <div>
              <p className="text-gray-600 mb-4">
                No auction has been scheduled yet. Set up a midseason FAAB auction below.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Auction Week
                  </label>
                  <input
                    type="number"
                    value={setupWeek}
                    onChange={(e) => setSetupWeek(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="1"
                    max="15"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Opens At (Local Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={setupOpens}
                    onChange={(e) => setSetupOpens(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Closes At (Local Time)
                  </label>
                  <input
                    type="datetime-local"
                    value={setupCloses}
                    onChange={(e) => setSetupCloses(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                {error && <p className="text-red-600 text-sm">{error}</p>}
                <button
                  onClick={() => createAuctionMutation.mutate()}
                  disabled={createAuctionMutation.isPending || !setupOpens || !setupCloses}
                  className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {createAuctionMutation.isPending ? 'Creating...' : 'Create Auction'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-gray-600">
              No auction has been scheduled yet. The commissioner can set one up.
            </p>
          )}
        </div>

        {/* Tiebreaker Priority - shown even when no auction */}
        <div className="bg-white rounded-lg shadow p-4">
          <button
            onClick={() => setShowTiebreaker(!showTiebreaker)}
            className="w-full flex justify-between items-center"
          >
            <div>
              <h3 className="font-bold text-gray-800">Tiebreaker Priority</h3>
              <p className="text-sm text-gray-500">
                You are #{myPriority?.priority || '?'} in tiebreaker order
                {myPriority && ` (${myPriority.totalPoints} total points)`}
              </p>
            </div>
            <span className="text-gray-400">{showTiebreaker ? '▲' : '▼'}</span>
          </button>

          {showTiebreaker && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm text-gray-600 mb-3">
                When two users bid the same amount, the user with the better (lower) tiebreaker wins.
                Priority is based on standings: lower standings = higher priority.
              </p>
              <div className="space-y-2">
                {waiverPriority.map((wp) => (
                  <div
                    key={wp.userId}
                    className={`p-2 rounded flex justify-between items-center ${
                      wp.userId === user?.id ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-800 rounded-full font-bold text-sm">
                        {wp.priority}
                      </span>
                      <span className={wp.userId === user?.id ? 'font-bold' : ''}>
                        {wp.userName}
                        {wp.userId === user?.id && ' (You)'}
                      </span>
                    </div>
                    <span className="text-gray-500 text-sm">{wp.totalPoints} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Auction exists - show appropriate view based on status
  const status = auctionState.status;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">FAAB Auction - Week {auctionState.weekNumber}</h2>
            <p className="text-sm text-gray-600">
              {status === 'SCHEDULED' && `Opens: ${new Date(auctionState.opensAt!).toLocaleString()}`}
              {status === 'OPEN' && `Closes in: ${countdown}`}
              {status === 'FINALIZING' && 'Processing results...'}
              {status === 'COMPLETE' && 'Auction Complete'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-green-600">${auctionState.myBudgetRemaining}</div>
            <p className="text-sm text-gray-500">Budget Remaining</p>
          </div>
        </div>
        {/* Status badge */}
        <div className="mt-2">
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              status === 'SCHEDULED'
                ? 'bg-yellow-100 text-yellow-800'
                : status === 'OPEN'
                ? 'bg-green-100 text-green-800'
                : status === 'FINALIZING'
                ? 'bg-blue-100 text-blue-800'
                : 'bg-gray-100 text-gray-800'
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">
            x
          </button>
        </div>
      )}

      {/* My Bids */}
      {auctionState.myBids && auctionState.myBids.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-gray-800 mb-3">My Bids</h3>
          <div className="space-y-2">
            {auctionState.myBids.map((bid) => {
              const team = availableTeams.find((t) => t.id === bid.addTeamId);
              const dropTeam = myRoster.find((t) => t.teamId === bid.dropTeamId);
              const highBid = highBidMap.get(bid.addTeamId);
              const isWinning = highBid && bid.amount >= highBid.highBid;

              return (
                <div
                  key={bid.id}
                  className={`p-3 rounded-lg border ${
                    bid.status === 'ACTIVE'
                      ? isWinning
                        ? 'border-green-300 bg-green-50'
                        : 'border-yellow-300 bg-yellow-50'
                      : bid.status === 'WON'
                      ? 'border-green-300 bg-green-50'
                      : 'border-gray-300 bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{team?.name || `Team #${bid.addTeamId}`}</span>
                      <span className="text-gray-500 mx-2">|</span>
                      <span className="text-green-600 font-bold">${bid.amount}</span>
                      {highBid && bid.status === 'ACTIVE' && (
                        <span className="text-gray-500 text-sm ml-2">
                          (High: ${highBid.highBid}, {highBid.bidCount} bids)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          bid.status === 'ACTIVE'
                            ? 'bg-blue-100 text-blue-800'
                            : bid.status === 'WON'
                            ? 'bg-green-100 text-green-800'
                            : bid.status === 'LOST'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {bid.status}
                      </span>
                      {bid.status === 'ACTIVE' && status === 'OPEN' && (
                        <button
                          onClick={() => cancelBidMutation.mutate(bid.id)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Drop: {dropTeam?.teamName || `Team #${bid.dropTeamId}`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available Teams */}
      {status === 'OPEN' && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-gray-800 mb-3">Available Teams</h3>

          {/* Search */}
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg mb-3"
          />

          {/* Team list */}
          <div className="max-h-96 overflow-y-auto space-y-2">
            {filteredTeams.map((team) => {
              const highBid = highBidMap.get(team.id);
              const myBid = myActiveBidsMap.get(team.id);

              return (
                <div
                  key={team.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    team.isLocked
                      ? 'bg-gray-100 border-gray-300 cursor-not-allowed opacity-60'
                      : selectedTeam?.id === team.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-green-300'
                  }`}
                  onClick={() => !team.isLocked && setSelectedTeam(team)}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{team.name}</span>
                      {team.abbreviation && (
                        <span className="text-gray-500 ml-2">({team.abbreviation})</span>
                      )}
                      <span className="text-gray-400 ml-2 text-sm">{team.conference}</span>
                    </div>
                    <div className="text-right">
                      {team.isLocked ? (
                        <span className="text-red-600 text-sm">Locked (Game Started)</span>
                      ) : highBid ? (
                        <span className="text-green-600 font-bold">${highBid.highBid}</span>
                      ) : (
                        <span className="text-gray-400">No bids</span>
                      )}
                      {myBid && (
                        <div className="text-xs text-blue-600">Your bid: ${myBid.amount}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Bid Form */}
      {selectedTeam && status === 'OPEN' && (
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-bold text-gray-800 mb-3">
            Place Bid: {selectedTeam.name}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bid Amount ($)
              </label>
              <input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                min="0"
                max={auctionState.myBudgetRemaining}
              />
              <p className="text-xs text-gray-500 mt-1">
                Max: ${auctionState.myBudgetRemaining}
                {highBidMap.has(selectedTeam.id) &&
                  ` | Current high: $${highBidMap.get(selectedTeam.id)!.highBid}`}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Team to Drop
              </label>
              <select
                value={selectedDropTeam || ''}
                onChange={(e) => setSelectedDropTeam(parseInt(e.target.value))}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">Select team to drop...</option>
                {myRoster.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName} ({team.conference})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (selectedDropTeam && bidAmount) {
                    placeBidMutation.mutate({
                      addTeamId: selectedTeam.id,
                      dropTeamId: selectedDropTeam,
                      amount: parseInt(bidAmount),
                    });
                  }
                }}
                disabled={
                  placeBidMutation.isPending ||
                  !selectedDropTeam ||
                  !bidAmount ||
                  parseInt(bidAmount) > (auctionState.myBudgetRemaining || 0)
                }
                className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              >
                {placeBidMutation.isPending ? 'Placing...' : 'Place Bid'}
              </button>
              <button
                onClick={() => {
                  setSelectedTeam(null);
                  setBidAmount('');
                  setSelectedDropTeam(null);
                }}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* My Roster */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="font-bold text-gray-800 mb-3">My Roster</h3>
        <div className="space-y-2">
          {myRoster.map((team) => (
            <div key={team.teamId} className="p-2 bg-gray-50 rounded flex justify-between">
              <span>
                {team.teamName}
                {team.abbreviation && (
                  <span className="text-gray-500 ml-1">({team.abbreviation})</span>
                )}
              </span>
              <span className="text-sm text-gray-500">{team.acquiredVia}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tiebreaker Priority */}
      <div className="bg-white rounded-lg shadow p-4">
        <button
          onClick={() => setShowTiebreaker(!showTiebreaker)}
          className="w-full flex justify-between items-center"
        >
          <div>
            <h3 className="font-bold text-gray-800">Tiebreaker Priority</h3>
            <p className="text-sm text-gray-500">
              You are #{myPriority?.priority || '?'} in tiebreaker order
              {myPriority && ` (${myPriority.totalPoints} total points)`}
            </p>
          </div>
          <span className="text-gray-400">{showTiebreaker ? '▲' : '▼'}</span>
        </button>

        {showTiebreaker && (
          <div className="mt-4 border-t pt-4">
            <p className="text-sm text-gray-600 mb-3">
              When two users bid the same amount, the user with the better (lower) tiebreaker wins.
              Priority is based on standings: lower standings = higher priority.
            </p>
            <div className="space-y-2">
              {waiverPriority.map((wp) => (
                <div
                  key={wp.userId}
                  className={`p-2 rounded flex justify-between items-center ${
                    wp.userId === user?.id ? 'bg-purple-50 border border-purple-200' : 'bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 flex items-center justify-center bg-purple-100 text-purple-800 rounded-full font-bold text-sm">
                      {wp.priority}
                    </span>
                    <span className={wp.userId === user?.id ? 'font-bold' : ''}>
                      {wp.userName}
                      {wp.userId === user?.id && ' (You)'}
                    </span>
                  </div>
                  <span className="text-gray-500 text-sm">{wp.totalPoints} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
