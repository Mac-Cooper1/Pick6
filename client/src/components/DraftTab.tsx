import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { draftApi, leagueApi } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './Button';
import { ErrorMessage } from './ErrorMessage';
import { Team } from '../types';

interface DraftTabProps {
  leagueId: number;
}

export function DraftTab({ leagueId }: DraftTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [error, setError] = useState('');

  const {
    data: league,
    isLoading: leagueLoading,
  } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => leagueApi.getLeague(leagueId),
  });

  const {
    data: picks,
    isLoading: picksLoading,
  } = useQuery({
    queryKey: ['draftPicks', leagueId],
    queryFn: () => draftApi.getDraftPicks(leagueId),
    refetchInterval: 3000, // Poll every 3 seconds
  });

  const {
    data: availableTeams,
    isLoading: teamsLoading,
  } = useQuery({
    queryKey: ['availableTeams', leagueId],
    queryFn: () => draftApi.getAvailableTeams(leagueId),
    refetchInterval: 3000,
  });

  const {
    data: members,
  } = useQuery({
    queryKey: ['leagueMembers', leagueId],
    queryFn: () => leagueApi.getLeagueMembers(leagueId),
  });

  const draftMutation = useMutation({
    mutationFn: (teamId: number) => draftApi.draftTeam(leagueId, { teamId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draftPicks', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['availableTeams', leagueId] });
      queryClient.invalidateQueries({ queryKey: ['leagueMembers', leagueId] });
      setSelectedTeam(null);
      setSearchTerm('');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed to draft team');
    },
  });

  const userPicks = picks?.filter((pick) => pick.user.id === user?.id) || [];
  const canDraft = userPicks.length < 6;

  const filteredTeams = availableTeams?.filter((team) =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleDraft = () => {
    if (!selectedTeam) return;
    draftMutation.mutate(selectedTeam.id);
  };

  const handleSelectTeam = (team: Team) => {
    setSelectedTeam(team);
    setSearchTerm(team.name);
    setShowDropdown(false);
  };

  const totalPicks = (members?.length || 0) * 6;

  if (leagueLoading || picksLoading || teamsLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Draft Header */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-2xl font-bold text-green-800 mb-4">Draft Board</h2>
        <p className="text-gray-600 mb-4">
          Pick {(picks?.length || 0) + 1} of {totalPicks}
        </p>

        {/* Draft Input */}
        {canDraft && !league?.draftComplete && (
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3">Draft Your Team ({userPicks.length}/6)</h3>

            {error && (
              <div className="mb-3">
                <ErrorMessage message={error} />
              </div>
            )}

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search teams..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                    setSelectedTeam(null);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />

                {showDropdown && searchTerm && filteredTeams.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-lg mt-1 max-h-60 overflow-y-auto shadow-lg">
                    {filteredTeams.slice(0, 20).map((team) => (
                      <div
                        key={team.id}
                        onClick={() => handleSelectTeam(team)}
                        className="p-3 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                      >
                        <div className="font-medium">{team.name}</div>
                        <div className="text-sm text-gray-600">{team.conference}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={handleDraft}
                disabled={!selectedTeam || draftMutation.isPending}
              >
                {draftMutation.isPending ? 'Drafting...' : 'Draft'}
              </Button>
            </div>
          </div>
        )}

        {!canDraft && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-800">
            You've drafted all 6 teams!
          </div>
        )}

        {league?.draftComplete && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-800">
            Draft is complete!
          </div>
        )}
      </div>

      {/* Draft Picks Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-green-600 text-white">
              <tr>
                <th className="p-3 text-left">Pick</th>
                <th className="p-3 text-left">Round</th>
                <th className="p-3 text-left">Player</th>
                <th className="p-3 text-left">Team</th>
                <th className="p-3 text-left">Conference</th>
              </tr>
            </thead>
            <tbody>
              {picks && picks.length > 0 ? (
                picks.map((pick, idx) => (
                  <tr
                    key={pick.id}
                    className={`${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} ${
                      pick.user.id === user?.id ? 'font-semibold bg-green-50' : ''
                    }`}
                  >
                    <td className="p-3">{pick.pickNumber}</td>
                    <td className="p-3">{pick.round}</td>
                    <td className="p-3">{pick.user.name}</td>
                    <td className="p-3">{pick.team.name}</td>
                    <td className="p-3">{pick.team.conference}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-500">
                    No picks yet. Start drafting!
                  </td>
                </tr>
              )}

              {/* Empty rows for upcoming picks */}
              {picks &&
                Array.from({ length: totalPicks - picks.length }).map((_, idx) => (
                  <tr
                    key={`empty-${idx}`}
                    className={(picks.length + idx) % 2 === 0 ? 'bg-gray-50' : 'bg-white'}
                  >
                    <td className="p-3 text-gray-400">{picks.length + idx + 1}</td>
                    <td className="p-3 text-gray-400">
                      {Math.ceil((picks.length + idx + 1) / (members?.length || 1))}
                    </td>
                    <td className="p-3 text-gray-400">-</td>
                    <td className="p-3 text-gray-400">-</td>
                    <td className="p-3 text-gray-400">-</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
