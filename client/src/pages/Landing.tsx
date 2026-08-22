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
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    if (authMode === 'signup') {
      if (!name) {
        setError('Name is required');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        await register(name, email, password);
        navigate('/dashboard');
      } else {
        try {
          await login(email, password);
          navigate('/dashboard');
        } catch (err: any) {
          if (err.response?.status === 401) {
            setError('Invalid email or password.');
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
      <div className="bg-white rounded-lg shadow-2xl p-6 sm:p-8 max-w-md w-full">
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-green-800 mb-2">Pick 6</h1>
          <p className="text-gray-600">College Football Fantasy</p>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6">
          <Button
            variant={authMode === 'signin' ? 'primary' : 'secondary'}
            onClick={() => {
              setAuthMode('signin');
              setError('');
            }}
          >
            Sign In
          </Button>
          <Button
            variant={authMode === 'signup' ? 'primary' : 'secondary'}
            onClick={() => {
              setAuthMode('signup');
              setError('');
            }}
          >
            Sign Up
          </Button>
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

          <Input
            type="password"
            placeholder={authMode === 'signup' ? 'Password (8+ characters)' : 'Password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" size="lg" fullWidth disabled={isLoading}>
            {isLoading ? 'Loading...' : authMode === 'signup' ? 'Create Account' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Pick 6 teams. Watch them win. That's it.</p>
        </div>
      </div>
    </div>
  );
}
