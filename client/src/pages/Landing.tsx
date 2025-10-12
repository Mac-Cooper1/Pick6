import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';

export function Landing() {
  const navigate = useNavigate();
  const { register, login } = useAuth();

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Email is required');
      return;
    }

    if (authMode === 'signup' && !name) {
      setError('Name is required');
      return;
    }

    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        // Register new user
        await register(name, email);
        navigate('/league-setup');
      } else {
        // Try to login existing user
        try {
          await login(email);
          navigate('/league-setup');
        } catch (err: any) {
          // If user not found, show helpful error
          if (err.response?.status === 404) {
            setError('No account found with this email. Please sign up first.');
          } else {
            setError(err.response?.data?.message || 'Login failed');
          }
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      // Handle registration errors
      if (err.response?.status === 409) {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(err.response?.data?.message || 'An error occurred');
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-green-800 mb-2">Pick 6</h1>
          <p className="text-gray-600">College Football Fantasy</p>
        </div>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => {
              setAuthMode('signin');
              setError('');
            }}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
              authMode === 'signin'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setAuthMode('signup');
              setError('');
            }}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
              authMode === 'signup'
                ? 'bg-green-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="mb-4">
            <ErrorMessage message={error} />
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {authMode === 'signup' && (
            <Input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          )}

          <Input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Button type="submit" fullWidth disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Continue'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Pick 6 teams. Watch them win. That's it.</p>
        </div>
      </div>
    </div>
  );
}
