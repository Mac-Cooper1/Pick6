import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { rosterApi, RosterTeam, WaiverClaim, WaiverPriority } from '../services/api';
import { Loading } from './Loading';
import { ErrorMessage } from './ErrorMessage';

interface WaiverTabProps {
  leagueId: number;
}

export function WaiverTab({ leagueId }: WaiverTabProps) {
  const { user } = useAuth();
  const [myRoster, setMyRoster] = useState<RosterTeam[]>([]);
  const [myClaims, setMyClaims] = useState<WaiverClaim[]>([]);
  const [waiverPriority, setWaiverPriority] = useState<WaiverPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [leagueId]);

  async function loadData() {
    try {
      setLoading(true);
      const [roster, claims, priority] = await Promise.all([
        rosterApi.getMyRoster(leagueId),
        rosterApi.getMyClaims(leagueId),
        rosterApi.getWaiverPriority(leagueId),
      ]);
      setMyRoster(roster);
      setMyClaims(claims);
      setWaiverPriority(priority);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load waiver data');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const myPriority = waiverPriority.find((p) => p.userId === user?.id);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Waiver Wire</h2>

      {/* FAAB Auction Notice */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-green-800 mb-2">Roster Changes via FAAB Auction</h3>
        <p className="text-green-700">
          This league uses the <strong>FAAB Auction</strong> system for roster changes.
          Go to the <strong>Auction</strong> tab to bid on available teams during the auction window.
        </p>
      </div>

      {/* Waiver priority info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-2">Waiver Priority (for tiebreakers)</h3>
        <p className="text-blue-700">
          You are #{myPriority?.priority || '?'} in waiver order
          {myPriority && ` (${myPriority.totalPoints} total points)`}
        </p>
        <p className="text-sm text-blue-600 mt-1">
          Lower standings = higher waiver priority (used for FAAB bid tiebreakers)
        </p>
      </div>

      {/* Full Waiver Priority List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="bg-purple-600 text-white p-4">
          <h3 className="text-lg font-bold">Waiver Priority Order</h3>
        </div>
        <div className="divide-y">
          {waiverPriority.map((wp) => (
            <div
              key={wp.userId}
              className={`p-3 flex justify-between items-center ${
                wp.userId === user?.id ? 'bg-purple-50' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 flex items-center justify-center bg-purple-100 text-purple-800 rounded-full font-bold">
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

      {/* My Roster */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
        <div className="bg-green-600 text-white p-4">
          <h3 className="text-lg font-bold">Your Roster</h3>
          <p className="text-green-100 text-sm">{myRoster.length} teams</p>
        </div>
        <div className="divide-y">
          {myRoster.map((team) => (
            <div key={team.teamId} className="p-3 flex justify-between items-center">
              <div>
                <div className="font-medium">{team.teamName}</div>
                <div className="text-sm text-gray-500">{team.conference}</div>
              </div>
              <span
                className={`px-2 py-1 text-xs font-medium rounded ${
                  team.acquiredVia === 'DRAFT'
                    ? 'bg-blue-100 text-blue-800'
                    : team.acquiredVia === 'AUCTION'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {team.acquiredVia}
              </span>
            </div>
          ))}
          {myRoster.length === 0 && (
            <div className="p-4 text-center text-gray-500">
              No teams on roster
            </div>
          )}
        </div>
      </div>

      {/* Transaction history */}
      {myClaims.length > 0 && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-gray-600 text-white p-4">
            <h3 className="text-lg font-bold">Transaction History</h3>
          </div>
          <div className="divide-y">
            {myClaims.map((claim) => (
              <div key={claim.id} className="p-4 flex items-center justify-between">
                <div>
                  <span className="font-medium">
                    Add: Team #{claim.addTeamId}
                  </span>
                  {' / '}
                  <span className="text-gray-600">
                    Drop: Team #{claim.dropTeamId}
                  </span>
                </div>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${
                    claim.status === 'WON'
                      ? 'bg-green-100 text-green-800'
                      : claim.status === 'LOST'
                      ? 'bg-red-100 text-red-800'
                      : claim.status === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {claim.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
