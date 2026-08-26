import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi } from '../services/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { Logo } from '../components/Logo';

type FlowMode = 'select' | 'create' | 'join';

interface LeagueSetupProps {
  mode?: 'create' | 'join';
}

export function LeagueSetup({ mode }: LeagueSetupProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();

  const [flowMode, setFlowMode] = useState<FlowMode>(mode || 'select');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Create league state
  const [leagueName, setLeagueName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [customJoinCode, setCustomJoinCode] = useState('');

  // Join league state; a shared join link (/league/join?code=ABC123)
  // presets the code, the member just confirms
  const [joinCode, setJoinCode] = useState(
    () => (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
  );

  // Update flow mode when prop changes
  useEffect(() => {
    if (mode) {
      setFlowMode(mode);
    }
  }, [mode]);

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!leagueName) {
      setError('League name is required');
      return;
    }

    setIsLoading(true);

    try {
      const league = await leagueApi.createLeague({
        name: leagueName,
        maxPlayers,
        customJoinCode: customJoinCode || undefined,
      });

      navigate(`/league/${league.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create league');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!joinCode) {
      setError('Join code is required');
      return;
    }

    setIsLoading(true);

    try {
      const league = await leagueApi.joinLeague({
        joinCode,
      });

      navigate(`/league/${league.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join league');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-100">
      <header className="bg-green-900 h-14 sm:h-16 flex items-center px-4 sm:px-6">
        <button type="button" onClick={() => navigate('/dashboard')} aria-label="Back to My Leagues">
          <Logo tone="dark" />
        </button>
      </header>
      <div className="max-w-md mx-auto p-4 sm:p-8">
        <h2 className="section-title text-3xl sm:text-4xl mb-1">
          {flowMode === 'create' ? 'Create a league' : flowMode === 'join' ? 'Join a league' : `Welcome, ${user?.name}`}
        </h2>
        <p className="text-gray-600 mb-6">
          {flowMode === 'create'
            ? 'Name it, pick a size, and share the code with your friends.'
            : flowMode === 'join'
            ? 'Enter the six-letter code from your commissioner.'
            : "Let's get you in a league."}
        </p>
        <div className="card p-5 sm:p-7">

        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} />
          </div>
        )}

        {flowMode === 'select' && (
          <div className="space-y-4">
            <Button size="lg" fullWidth onClick={() => setFlowMode('create')}>
              Create League
            </Button>
            <Button size="lg" fullWidth variant="secondary" onClick={() => setFlowMode('join')}>
              Join League
            </Button>
          </div>
        )}

        {flowMode === 'create' && (
          <form onSubmit={handleCreateLeague} className="space-y-4">
            <Input
              type="text"
              placeholder="The Saturday Syndicate"
              label="League Name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              required
            />

            <div>
              <label htmlFor="maxPlayers" className="block text-sm font-semibold text-gray-800 mb-1.5">
                Max Players
              </label>
              <select
                id="maxPlayers"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                className="w-full px-3.5 py-3 text-base bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-green-600"
              >
                {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} Players
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="text"
              placeholder="Leave blank to generate one"
              label="Custom Join Code (optional)"
              hint="Up to 6 letters or numbers"
              value={customJoinCode}
              onChange={(e) => setCustomJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="font-mono tracking-widest uppercase"
            />

            <div className="flex gap-2">
              <Button type="submit" size="lg" fullWidth disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create League'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => navigate('/dashboard')}
              >
                Back
              </Button>
            </div>
          </form>
        )}

        {flowMode === 'join' && (
          <form onSubmit={handleJoinLeague} className="space-y-4">
            <Input
              type="text"
              placeholder="ABC123"
              label="Join Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              className="font-mono tracking-widest uppercase text-xl"
              required
            />

            <div className="flex gap-2">
              <Button type="submit" size="lg" fullWidth disabled={isLoading}>
                {isLoading ? 'Joining...' : 'Join League'}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="secondary"
                onClick={() => navigate('/dashboard')}
              >
                Back
              </Button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>
  );
}
