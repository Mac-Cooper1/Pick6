import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leagueApi, matchupApi, cfbApi, TeamMatchup } from '../services/api';
import { ErrorMessage } from './ErrorMessage';

interface LeagueTabProps {
  leagueId: number;
}

// Format a team-relative spread (+3.5 = underdog by 3.5). The league scores
// off spreads, not moneylines, so that's what we surface.
function formatSpread(spread: number | null | undefined): string {
  if (spread === null || spread === undefined) return '';
  if (spread === 0) return 'PK';
  return spread > 0 ? `+${spread}` : `${spread}`;
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
    refetchInterval: 5000,
  });

  // Fetch matchups for all members
  const {
    data: allMatchups,
    isLoading: matchupsLoading,
  } = useQuery({
    queryKey: ['allMatchups', leagueId],
    queryFn: () => matchupApi.getAllMatchups(leagueId),
    enabled: !!league?.draftComplete,
    refetchInterval: 60000, // Refresh every minute
  });

  // Fetch rankings
  const { data: rankings } = useQuery({
    queryKey: ['rankings'],
    queryFn: () => cfbApi.getRankings(),
    staleTime: 3600000, // 1 hour
  });

  // Create a map of abbreviation -> rank for quick lookup
  const rankingsMap = useMemo(() => {
    const map = new Map<string, number>();
    if (rankings?.teams) {
      for (const team of rankings.teams) {
        if (team.abbreviation) {
          map.set(team.abbreviation.toUpperCase(), team.rank);
        }
      }
    }
    return map;
  }, [rankings]);

  // Create a map of (userId, teamId) -> matchup for quick lookup
  const matchupMap = useMemo(() => {
    const map = new Map<string, TeamMatchup>();
    if (allMatchups) {
      for (const userMatchups of allMatchups) {
        for (const matchup of userMatchups.matchups) {
          map.set(`${userMatchups.userId}-${matchup.teamId}`, matchup);
        }
      }
    }
    return map;
  }, [allMatchups]);

  if (leagueLoading || membersLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (leagueError || membersError) {
    return (
      <div className="p-4 sm:p-6">
        <ErrorMessage
          message={(leagueError as any)?.response?.data?.message || 'Failed to load league data'}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* League Info Card */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-2">{league?.name}</h2>
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
            <div key={member.id} className="bg-white rounded-lg shadow p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-lg sm:text-xl font-bold text-gray-800">
                  {idx + 1}. {member.name}
                </h3>
                <span className="text-sm text-gray-500">{member.teams.length}/5 teams</span>
              </div>

              {member.teams.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {member.teams.map((team) => {
                    // Get matchup data for this team
                    const matchup = matchupMap.get(`${member.id}-${team.id}`);
                    const game = matchup?.game;
                    const odds = matchup?.odds;

                    // Get team's rank (check abbreviation from matchup data)
                    const teamAbbrev = matchup?.abbreviation?.toUpperCase();
                    const teamRank = teamAbbrev ? rankingsMap.get(teamAbbrev) : undefined;

                    // Determine if we're in bowl season (December 10+ or January)
                    const now = new Date();
                    const isBowlSeason = (now.getMonth() === 11 && now.getDate() > 10) || now.getMonth() === 0;

                    // Format opponent display
                    let opponentDisplay = 'No Game';
                    if (game) {
                      opponentDisplay = `${game.isHomeTeam ? 'vs.' : '@'} ${game.opponentAbbreviation || game.opponent}`;
                    } else if (isBowlSeason) {
                      opponentDisplay = 'Season Over';
                    }

                    // Team-relative spread (drives the ±3.5 scoring modifiers)
                    const teamSpread = odds?.teamSpread;

                    return (
                      <div
                        key={team.id}
                        className="bg-green-50 p-3 rounded-lg border border-green-200"
                      >
                        {/* Team name with rank */}
                        <div className="flex items-center gap-2">
                          {teamRank && (
                            <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-1.5 py-0.5 rounded">
                              #{teamRank}
                            </span>
                          )}
                          <span className="font-semibold text-green-900">{team.name}</span>
                        </div>

                        {/* Conference */}
                        <div className="text-xs text-green-700">{team.conference}</div>

                        {/* Matchup info */}
                        {league?.draftComplete && (
                          <div className="mt-2 pt-2 border-t border-green-200">
                            <div className="flex items-center justify-between">
                              <span
                                className={`text-sm ${
                                  game ? 'text-gray-700' : 'text-gray-400 italic'
                                }`}
                              >
                                {opponentDisplay}
                              </span>
                              {game &&
                                (teamSpread !== null && teamSpread !== undefined ? (
                                  <span
                                    className={`text-sm font-medium ${
                                      teamSpread >= 3.5
                                        ? 'text-green-600' // upset-bonus territory (+2 on a win)
                                        : teamSpread <= -3.5
                                        ? 'text-red-500' // bust risk (−1 on a loss)
                                        : 'text-gray-600'
                                    }`}
                                    title={
                                      teamSpread >= 3.5
                                        ? 'Underdog of 3.5+ — a win scores 2'
                                        : teamSpread <= -3.5
                                        ? 'Favorite by 3.5+ — a loss scores −1'
                                        : 'Inside the ±3.5 window — regular scoring'
                                    }
                                  >
                                    {formatSpread(teamSpread)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 italic" title="Books haven't posted a line yet — odds re-sync daily until kickoff">
                                    no line yet
                                  </span>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-gray-400 text-sm">No teams drafted yet</p>
              )}
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg shadow p-4 sm:p-6 text-center text-gray-500">
            No members yet
          </div>
        )}
      </div>
    </div>
  );
}
