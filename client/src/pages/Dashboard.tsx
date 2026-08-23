import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi, MyLeague } from '../services/api';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/Button';

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [leagues, setLeagues] = useState<MyLeague[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadLeagues();
  }, []);

  async function loadLeagues() {
    try {
      setLoading(true);
      setError(null);
      const data = await leagueApi.getMyLeagues();
      setLeagues(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }

  function getDraftStatusBadge(league: MyLeague) {
    const status = league.draftStatus;
    const colors: Record<string, string> = {
      NOT_STARTED: 'bg-gray-100 text-gray-800',
      SCHEDULED: 'bg-yellow-100 text-yellow-800',
      LIVE: 'bg-red-100 text-red-800 animate-pulse',
      PAUSED: 'bg-orange-100 text-orange-800',
      COMPLETE: 'bg-green-100 text-green-800',
    };

    const labels: Record<string, string> = {
      NOT_STARTED: 'Draft Not Scheduled',
      SCHEDULED: 'Draft Scheduled',
      LIVE: 'Draft Live',
      PAUSED: 'Draft Paused',
      COMPLETE: 'Draft Complete',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap ${colors[status]}`}>
        {labels[status]}
      </span>
    );
  }

  function formatDraftTime(dateStr: string | null) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  }

  function getCountdown(dateStr: string | null) {
    if (!dateStr) return null;
    const now = new Date();
    const target = new Date(dateStr);
    const diff = target.getTime() - now.getTime();

    if (diff <= 0) return 'Starting soon...';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-green-800 text-white px-3 py-2 sm:px-4 sm:py-3 shadow-lg">
        <div className="max-w-6xl mx-auto flex justify-between items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-bold">Pick 6</h1>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-sm truncate min-w-0">
              <span className="hidden sm:inline">Welcome, </span>
              {user?.name}
            </span>
            <Button variant="nav" size="sm" onClick={logout} className="shrink-0">
              Logout
            </Button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header — title row, then two equal buttons on phones; one row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">My Leagues</h2>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <Button variant="outline" onClick={() => navigate('/league/join')}>
              Join League
            </Button>
            <Button onClick={() => navigate('/league/create')}>
              Create League
            </Button>
          </div>
        </div>

        {error && <ErrorMessage message={error} />}

        {/* No leagues message */}
        {leagues.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow-md p-6 sm:p-8 text-center">
            <div className="text-6xl mb-4">🏈</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              No leagues yet
            </h3>
            <p className="text-gray-600 mb-6">
              Create a new league or join an existing one to get started!
            </p>
            <div className="grid grid-cols-1 gap-3 sm:flex sm:justify-center sm:gap-4">
              <Button variant="outline" size="lg" onClick={() => navigate('/league/join')}>
                Join a League
              </Button>
              <Button size="lg" onClick={() => navigate('/league/create')}>
                Create a League
              </Button>
            </div>
          </div>
        )}

        {/* League cards */}
        <div className="grid gap-4">
          {leagues.map((league) => (
            <div
              key={league.id}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
              onClick={() => navigate(`/league/${league.id}`)}
            >
              <div className="p-4 sm:p-6">
                <div className="flex flex-wrap justify-between items-start gap-2 mb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800">
                        {league.name}
                      </h3>
                      {league.isCommissioner && (
                        <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full whitespace-nowrap">
                          Commissioner
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Code: {league.joinCode} | {league.memberCount}/{league.maxPlayers} members
                    </p>
                  </div>
                  {getDraftStatusBadge(league)}
                </div>

                {/* Draft info */}
                {league.draftStatus === 'SCHEDULED' && league.draftScheduledAt && (
                  <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <p className="text-sm font-medium text-yellow-800">
                          Draft scheduled for:
                        </p>
                        <p className="text-sm text-yellow-700">
                          {formatDraftTime(league.draftScheduledAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-yellow-600">Starts in</p>
                        <p className="text-lg font-bold text-yellow-800">
                          {getCountdown(league.draftScheduledAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {league.draftStatus === 'LIVE' && (
                  <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-medium text-red-800 animate-pulse">
                      Draft is LIVE! Click to join the draft room.
                    </p>
                  </div>
                )}

                {/* Stats */}
                {league.draftComplete && league.userStats.rank && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">
                        {league.userStats.totalPoints}
                      </p>
                      <p className="text-xs text-gray-500">Total Points</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-800">
                        #{league.userStats.rank}
                      </p>
                      <p className="text-xs text-gray-500">
                        of {league.userStats.totalMembers}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-800">
                        Week {league.currentWeek}
                      </p>
                      <p className="text-xs text-gray-500">{league.seasonYear}</p>
                    </div>
                  </div>
                )}

                {/* Members preview */}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-gray-500 mb-2">Members:</p>
                  <div className="flex flex-wrap gap-1">
                    {league.members.slice(0, 8).map((member) => (
                      <span
                        key={member.id}
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          member.id === user?.id
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {member.name}
                      </span>
                    ))}
                    {league.members.length > 8 && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
                        +{league.members.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
