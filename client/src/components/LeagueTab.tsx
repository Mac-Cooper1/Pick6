import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { leagueApi } from '../services/api';
import { Loading } from './Loading';
import { ErrorMessage } from './ErrorMessage';

interface LeagueTabProps {
  leagueId: number;
}

export function LeagueTab({ leagueId }: LeagueTabProps) {
  const {
    data: league,
    isLoading: leagueLoading,
    error: leagueError,
  } = useQuery({
    queryKey: ['league', leagueId],
    queryFn: () => leagueApi.getLeague(leagueId),
  });

  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
  } = useQuery({
    queryKey: ['leagueMembers', leagueId],
    queryFn: () => leagueApi.getLeagueMembers(leagueId),
    refetchInterval: 5000, // Refresh every 5 seconds to see new picks
  });

  if (leagueLoading || membersLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (leagueError || membersError) {
    return (
      <div className="p-6">
        <ErrorMessage
          message={(leagueError as any)?.response?.data?.message || 'Failed to load league data'}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* League Info Card */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-2xl font-bold text-green-800 mb-2">{league?.name}</h2>
        <div className="text-gray-600 space-y-1">
          <p>
            Join Code: <span className="font-mono font-bold text-lg">{league?.joinCode}</span>
          </p>
          <p>
            Players: {members?.length}/{league?.maxPlayers}
          </p>
          {league?.draftComplete && (
            <p className="text-green-600 font-semibold">Draft Complete!</p>
          )}
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-4">
        {members && members.length > 0 ? (
          members.map((member, idx) => (
            <div key={member.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-800">
                  {idx + 1}. {member.name}
                </h3>
                <span className="text-sm text-gray-500">{member.teams.length}/6 teams</span>
              </div>

              {member.teams.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {member.teams.map((team) => (
                    <div
                      key={team.id}
                      className="bg-green-100 p-3 rounded-lg border border-green-200"
                    >
                      <div className="font-semibold text-green-900">{team.name}</div>
                      <div className="text-xs text-green-700">{team.conference}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Pick #{team.pickNumber} (Round {team.round})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No teams drafted yet</p>
              )}
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            No members yet
          </div>
        )}
      </div>
    </div>
  );
}
