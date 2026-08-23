import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leagueApi, matchupApi, cfbApi, TeamMatchup } from '../services/api';
import { ErrorMessage } from './ErrorMessage';
import { Loading } from './Loading';

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

  if (leagueLoading || membersLoading) return <Loading inline />;

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
      {/* League header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="section-title">{league?.name}</h2>
          <p className="section-sub">
            {members?.length}/{league?.maxPlayers} players
            {league?.draftComplete && <span className="text-green-700 font-semibold"> &middot; draft complete</span>}
          </p>
        </div>
        <div className="card px-4 py-2.5 inline-flex items-center gap-3 self-start sm:self-auto">
          <span className="label">Join code</span>
          <span className="font-mono font-bold text-lg tracking-widest text-gray-900">{league?.joinCode}</span>
        </div>
      </div>

      {/* Members List */}
      <div className="space-y-4">
        {members && members.length > 0 ? (
          members.map((member, idx) => (
            <div key={member.id} className="card p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="font-display font-bold uppercase tracking-wide text-xl sm:text-2xl text-gray-900 flex items-baseline gap-2">
                  <span className="text-gray-400 text-base">{idx + 1}</span>
                  {member.name}
                </h3>
                <span className="label">{member.teams.length}/5 teams</span>
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
                        className="bg-gray-50 p-3 rounded-lg border border-gray-200"
                      >
                        {/* Team name with rank */}
                        <div className="flex items-center gap-2">
                          {teamRank && (
                            <span className="bg-amber-400 text-amber-950 font-display font-bold text-xs px-1.5 py-0.5 rounded">
                              #{teamRank}
                            </span>
                          )}
                          <span className="font-semibold text-gray-900">{team.name}</span>
                        </div>

                        {/* Conference */}
                        <div className="label text-[11px]">{team.conference}</div>

                        {/* Matchup info */}
                        {league?.draftComplete && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
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
                                    className={`font-display font-bold text-base ${
                                      teamSpread >= 3.5
                                        ? 'text-green-700' // upset-bonus territory (+2 on a win)
                                        : teamSpread <= -3.5
                                        ? 'text-red-600' // bust risk (−1 on a loss)
                                        : 'text-gray-600'
                                    }`}
                                    title={
                                      teamSpread >= 3.5
                                        ? 'Underdog of 3.5+: a win scores 2'
                                        : teamSpread <= -3.5
                                        ? 'Favorite by 3.5+: a loss scores -1'
                                        : 'Inside the 3.5-point window: regular scoring'
                                    }
                                  >
                                    {formatSpread(teamSpread)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-gray-400 italic" title="Books haven't posted a line yet. Odds re-sync daily until kickoff.">
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
          <div className="card p-6 text-center text-gray-500">No members yet</div>
        )}
      </div>
    </div>
  );
}
