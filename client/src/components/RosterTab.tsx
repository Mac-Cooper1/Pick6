import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { rosterApi, RosterTeam } from '../services/api';
import { Loading } from './Loading';
import { ErrorMessage } from './ErrorMessage';

interface RosterTabProps {
  leagueId: number;
}

interface Roster {
  userId: number;
  userName: string;
  roster: RosterTeam[];
}

export function RosterTab({ leagueId }: RosterTabProps) {
  const { user } = useAuth();
  const [rosters, setRosters] = useState<Roster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<number | null>(null);

  useEffect(() => {
    loadRosters();
  }, [leagueId]);

  async function loadRosters() {
    try {
      setLoading(true);
      const data = await rosterApi.getAllRosters(leagueId);
      setRosters(data);
      // Default to current user's roster
      if (user && !selectedUser) {
        setSelectedUser(user.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load rosters');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;

  const selectedRoster = rosters.find((r) => r.userId === selectedUser);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">Rosters</h2>

      {/* User selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          View roster for:
        </label>
        <div className="flex flex-wrap gap-2">
          {rosters.map((roster) => (
            <button
              key={roster.userId}
              onClick={() => setSelectedUser(roster.userId)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedUser === roster.userId
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {roster.userName}
              {roster.userId === user?.id && ' (You)'}
            </button>
          ))}
        </div>
      </div>

      {/* Selected roster */}
      {selectedRoster && (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="bg-green-600 text-white p-4">
            <h3 className="text-xl font-bold">
              {selectedRoster.userName}'s Roster
            </h3>
            <p className="text-green-100">
              {selectedRoster.roster.length} / 6 teams
            </p>
          </div>

          <div className="divide-y">
            {selectedRoster.roster.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No teams on roster yet
              </div>
            ) : (
              selectedRoster.roster.map((team, idx) => (
                <div
                  key={team.teamId}
                  className="p-4 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl font-bold text-gray-300">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-semibold text-lg">{team.teamName}</h4>
                      <p className="text-sm text-gray-500">{team.conference}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-block px-2 py-1 text-xs font-medium rounded ${
                        team.acquiredVia === 'DRAFT'
                          ? 'bg-blue-100 text-blue-800'
                          : team.acquiredVia === 'WAIVER'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {team.acquiredVia}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* League rosters overview */}
      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">All Rosters Overview</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rosters.map((roster) => (
            <div
              key={roster.userId}
              className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => setSelectedUser(roster.userId)}
            >
              <h4 className="font-semibold mb-2">
                {roster.userName}
                {roster.userId === user?.id && (
                  <span className="text-green-600 ml-1">(You)</span>
                )}
              </h4>
              <div className="text-sm text-gray-600 space-y-1">
                {roster.roster.slice(0, 3).map((team) => (
                  <div key={team.teamId}>{team.teamName}</div>
                ))}
                {roster.roster.length > 3 && (
                  <div className="text-gray-400">
                    +{roster.roster.length - 3} more...
                  </div>
                )}
                {roster.roster.length === 0 && (
                  <div className="text-gray-400 italic">No teams yet</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
