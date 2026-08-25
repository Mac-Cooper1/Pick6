import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { Logo } from '../components/Logo';

type AuthMode = 'signin' | 'signup';

export function Login() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, isLoading: authLoading, register, login } = useAuth();

  const authMode: AuthMode = params.get('mode') === 'signup' ? 'signup' : 'signin';
  // Collected as first + last but stored as one name: the User table keeps a
  // single (live, prod) name column, so the split lives only in this form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  const setMode = (mode: AuthMode) => {
    setError('');
    setParams(mode === 'signup' ? { mode } : {}, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    if (authMode === 'signup') {
      if (!firstName.trim() || !lastName.trim()) {
        setError('First and last name are required');
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
        const fullName = `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ');
        await register(fullName, email, password);
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
    <div className="min-h-[100dvh] grid grid-cols-1 lg:grid-cols-2 bg-gray-100">
      {/* Brand panel */}
      <div className="bg-green-900 text-white px-4 sm:px-6 py-5 lg:p-12 flex flex-col justify-between">
        <Link to="/" className="inline-flex self-start" aria-label="Pick 6 home">
          <Logo tone="dark" />
        </Link>
        <div className="hidden lg:block">
          <p className="font-display font-extrabold uppercase leading-[0.95] tracking-tight text-5xl xl:text-6xl">
            Five teams.
            <br />
            <span className="text-amber-400">Fifteen Saturdays.</span>
          </p>
          <p className="mt-5 text-white/75 max-w-[40ch] leading-relaxed">
            Sign in to check the leaderboard, or make an account and join with the code from your commissioner.
          </p>
        </div>
        <div className="hidden lg:block text-sm text-white/50">2026 season</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          <h1 className="section-title text-3xl sm:text-4xl mb-1">
            {authMode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-gray-600 mb-6">
            {authMode === 'signup' ? (
              <>
                Already have one?{' '}
                <button type="button" onClick={() => setMode('signin')} className="font-semibold text-green-800 underline underline-offset-2">
                  Sign in
                </button>
              </>
            ) : (
              <>
                New here?{' '}
                <button type="button" onClick={() => setMode('signup')} className="font-semibold text-green-800 underline underline-offset-2">
                  Create an account
                </button>
              </>
            )}
          </p>

          <div className="card p-5 sm:p-7">
            {error && (
              <div className="mb-4">
                <ErrorMessage message={error} />
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {authMode === 'signup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="First name"
                    type="text"
                    placeholder="Johnny"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                  <Input
                    label="Last name"
                    type="text"
                    placeholder="Football"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              )}

              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Your password'}
                autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" size="lg" fullWidth disabled={isLoading} className="mt-2">
                {isLoading ? 'One moment...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
