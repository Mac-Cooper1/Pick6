import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretRight } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi, MyLeague } from '../services/api';
import { Loading } from '../components/Loading';
import { ErrorMessage } from '../components/ErrorMessage';
import { Button } from '../components/Button';
import { AppHeader } from '../components/AppHeader';
import { Mark } from '../components/Logo';

export function Dashboard() {
  const { user } = useAuth();
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
      NOT_STARTED: 'bg-gray-100 text-gray-700 border-gray-200',
      SCHEDULED: 'bg-amber-50 text-amber-800 border-amber-200',
      LIVE: 'bg-red-600 text-white border-red-600 animate-pulse',
      PAUSED: 'bg-orange-50 text-orange-800 border-orange-200',
      COMPLETE: 'bg-green-50 text-green-800 border-green-200',
    };

    const labels: Record<string, string> = {
      NOT_STARTED: 'Draft not scheduled',
      SCHEDULED: 'Draft scheduled',
      LIVE: 'Draft live',
      PAUSED: 'Draft paused',
      COMPLETE: 'Draft complete',
    };

    return (
      <span
        className={`px-2.5 py-1 font-display font-semibold uppercase tracking-wider text-xs rounded-full border whitespace-nowrap ${colors[status]}`}
      >
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

    if (diff <= 0) return 'Starting soon';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  if (loading) return <Loading />;

  return (
    <div className="min-h-[100dvh] bg-gray-100">
      <AppHeader />

      <main className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header: title row, then two equal buttons on phones; one row on desktop */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-end mb-5 sm:mb-6">
          <div>
            <h1 className="section-title">My Leagues</h1>
            <p className="section-sub">2026 season</p>
          </div>
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

        {/* Empty state */}
        {leagues.length === 0 && !error && (
          <div className="card p-8 sm:p-12 text-center">
            <Mark className="w-14 h-14 mx-auto mb-5" />
            <h2 className="font-display font-bold uppercase tracking-wide text-2xl text-gray-900 mb-2">
              No leagues yet
            </h2>
            <p className="text-gray-600 mb-6 max-w-sm mx-auto">
              Got a code from your commissioner? Join with it. Otherwise start a league and
              send the code to your friends.
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
            <button
              key={league.id}
              type="button"
              className="card text-left w-full overflow-hidden hover:shadow-card-lg hover:border-green-300 active:translate-y-px transition-[box-shadow,border-color,transform] focus:outline-none focus-visible:ring-2 focus-visible:ring-green-600"
              onClick={() => navigate(`/league/${league.id}`)}
            >
              <div className="p-4 sm:p-6">
                <div className="flex justify-between items-start gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                      <h2 className="font-display font-bold uppercase tracking-wide text-2xl sm:text-3xl leading-none text-gray-900">
                        {league.name}
                      </h2>
                      {league.isCommissioner && (
                        <span className="label text-amber-700">Commissioner</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      Code <span className="font-mono font-semibold text-gray-700">{league.joinCode}</span>
                      <span className="mx-2 text-gray-300">|</span>
                      {league.memberCount}/{league.maxPlayers} players
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {getDraftStatusBadge(league)}
                    <CaretRight size={18} weight="bold" className="text-gray-400 hidden sm:block" />
                  </div>
                </div>

                {/* Draft info */}
                {league.draftStatus === 'SCHEDULED' && league.draftScheduledAt && (
                  <div className="mb-4 p-3 sm:p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex flex-wrap justify-between items-center gap-2">
                      <div>
                        <p className="label text-amber-800">Draft scheduled</p>
                        <p className="text-sm text-amber-900 font-medium">
                          {formatDraftTime(league.draftScheduledAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="label text-amber-800">Starts in</p>
                        <p className="font-display font-bold text-2xl leading-none text-amber-900">
                          {getCountdown(league.draftScheduledAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {league.draftStatus === 'LIVE' && (
                  <div className="mb-4 p-3 sm:p-4 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm font-semibold text-red-800">
                      The draft is live. Tap to enter the draft room.
                    </p>
                  </div>
                )}

                {/* Stats */}
                {league.draftComplete && league.userStats.rank && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                    <div>
                      <p className="font-display font-bold text-3xl leading-none text-green-700">
                        {league.userStats.totalPoints}
                      </p>
                      <p className="label mt-1">Points</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-3xl leading-none text-gray-900">
                        #{league.userStats.rank}
                        <span className="text-lg text-gray-400 font-semibold"> / {league.userStats.totalMembers}</span>
                      </p>
                      <p className="label mt-1">Rank</p>
                    </div>
                    <div>
                      <p className="font-display font-bold text-3xl leading-none text-gray-900">
                        {league.currentWeek}
                      </p>
                      <p className="label mt-1">Week</p>
                    </div>
                  </div>
                )}

                {/* Members preview */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex flex-wrap gap-1.5">
                    {league.members.slice(0, 8).map((member) => (
                      <span
                        key={member.id}
                        className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                          member.id === user?.id
                            ? 'bg-green-700 text-white'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {member.name}
                      </span>
                    ))}
                    {league.members.length > 8 && (
                      <span className="px-2.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-500">
                        +{league.members.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
