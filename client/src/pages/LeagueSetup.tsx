import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { leagueApi, authApi } from '../services/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { League } from '../types';

type FlowMode = 'select' | 'create' | 'join' | 'myLeagues';

export function LeagueSetup() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [flowMode, setFlowMode] = useState<FlowMode>('select');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [myLeagues, setMyLeagues] = useState<any[]>([]);

  // Create league state
  const [leagueName, setLeagueName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [password, setPassword] = useState('');
  const [customJoinCode, setCustomJoinCode] = useState('');

  // Join league state
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');

  // Fetch user's leagues on mount
  useEffect(() => {
    const fetchUserLeagues = async () => {
      try {
        const currentUser = await authApi.getCurrentUser();
        // TODO: Implement leagues fetching when backend endpoint is ready
        // if (currentUser.leagues && currentUser.leagues.length > 0) {
        //   setMyLeagues(currentUser.leagues);
        //   setFlowMode('myLeagues');
        // }
        console.log('Current user:', currentUser);
      } catch (err) {
        console.error('Failed to fetch leagues:', err);
      }
    };

    fetchUserLeagues();
  }, []);

  const handleCreateLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!leagueName || !password) {
      setError('League name and password are required');
      return;
    }

    setIsLoading(true);

    try {
      const league = await leagueApi.createLeague({
        name: leagueName,
        maxPlayers,
        password,
        customJoinCode: customJoinCode || undefined,
      });

      navigate(`/app/${league.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create league');
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoinLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!joinCode || !joinPassword) {
      setError('Join code and password are required');
      return;
    }

    setIsLoading(true);

    try {
      const league = await leagueApi.joinLeague({
        joinCode,
        password: joinPassword,
      });

      navigate(`/app/${league.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join league');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <h2 className="text-3xl font-bold text-green-800 text-center mb-2">
          Welcome, {user?.name}!
        </h2>
        <p className="text-gray-600 text-center mb-6">Let's get you in a league</p>

        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} />
          </div>
        )}

        {flowMode === 'myLeagues' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold mb-4">My Leagues</h3>

            <div className="space-y-2 mb-4">
              {myLeagues.map((league) => (
                <button
                  key={league.id}
                  onClick={() => navigate(`/app/${league.id}`)}
                  className="w-full p-4 text-left bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors"
                >
                  <div className="font-semibold text-green-900">{league.name}</div>
                  <div className="text-sm text-gray-600">Code: {league.joinCode}</div>
                </button>
              ))}
            </div>

            <div className="border-t pt-4 space-y-2">
              <Button fullWidth onClick={() => setFlowMode('create')}>
                Create New League
              </Button>
              <Button fullWidth variant="secondary" onClick={() => setFlowMode('join')}>
                Join Another League
              </Button>
            </div>
          </div>
        )}

        {flowMode === 'select' && (
          <div className="space-y-4">
            <Button fullWidth onClick={() => setFlowMode('create')}>
              Create League
            </Button>
            <Button fullWidth variant="secondary" onClick={() => setFlowMode('join')}>
              Join League
            </Button>
          </div>
        )}

        {flowMode === 'create' && (
          <form onSubmit={handleCreateLeague} className="space-y-4">
            <h3 className="text-xl font-semibold mb-4">Create New League</h3>

            <Input
              type="text"
              placeholder="League Name"
              label="League Name"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              required
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Players
              </label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {[8, 9, 10, 11, 12].map((n) => (
                  <option key={n} value={n}>
                    {n} Players
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="text"
              placeholder="Custom Join Code (optional)"
              label="Custom Join Code (optional)"
              value={customJoinCode}
              onChange={(e) => setCustomJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />

            <Input
              type="password"
              placeholder="League Password"
              label="League Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <div className="flex gap-2">
              <Button type="submit" fullWidth disabled={isLoading}>
                {isLoading ? 'Creating...' : 'Create League'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFlowMode('select')}
              >
                Back
              </Button>
            </div>
          </form>
        )}

        {flowMode === 'join' && (
          <form onSubmit={handleJoinLeague} className="space-y-4">
            <h3 className="text-xl font-semibold mb-4">Join League</h3>

            <Input
              type="text"
              placeholder="Join Code"
              label="Join Code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
              required
            />

            <Input
              type="password"
              placeholder="League Password"
              label="League Password"
              value={joinPassword}
              onChange={(e) => setJoinPassword(e.target.value)}
              required
            />

            <div className="flex gap-2">
              <Button type="submit" fullWidth disabled={isLoading}>
                {isLoading ? 'Joining...' : 'Join League'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFlowMode('select')}
              >
                Back
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
