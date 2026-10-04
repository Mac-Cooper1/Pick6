import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage, apiErrorStatus, authApi } from '../services/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { Logo } from '../components/Logo';

type AuthMode = 'signin' | 'signup';

/**
 * A `?next=` value that stays on this site, or null. Resolving it against
 * our own origin catches every way a browser reads a path as another host:
 * "//evil.com", "/\evil.com" (a backslash counts as a slash) and
 * "/<tab>/evil.com" (tabs and newlines are dropped). The result is checked
 * too: resolving dot segments turns "/.//evil.com" or "/%2e//evil.com" into
 * "//evil.com", which is another host again.
 */
function internalPath(raw: string | null): string | null {
  if (!raw?.startsWith('/')) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname.startsWith('//')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function Login() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user, isLoading: authLoading, register, login } = useAuth();

  const authMode: AuthMode = params.get('mode') === 'signup' ? 'signup' : 'signin';

  // Post-auth destination (set by ProtectedRoute / the 401 interceptor, e.g.
  // a shared join link). Internal paths only — never a full URL.
  const nextPath = internalPath(params.get('next'));
  const destination = nextPath || '/dashboard';
  // Collected as first + last but stored as one name: the User table keeps a
  // single (live, prod) name column, so the split lives only in this form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // ?forgot=1 opens the reset form (the reset page's "request a new link")
  const [showForgot, setShowForgot] = useState(params.get('forgot') === '1');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSentTo, setForgotSentTo] = useState('');

  if (!authLoading && user) return <Navigate to={destination} replace />;

  const setMode = (mode: AuthMode) => {
    setError('');
    // Keep the post-auth destination across sign-in/sign-up toggles
    const nextParams: Record<string, string> = {};
    if (mode === 'signup') nextParams.mode = mode;
    if (nextPath) nextParams.next = nextPath;
    setParams(nextParams, { replace: true });
  };

  const openForgot = () => {
    setForgotEmail(email);
    setForgotError('');
    setForgotSentTo('');
    setShowForgot(true);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = forgotEmail.trim();
    if (!address) {
      setForgotError('Enter the email you signed up with');
      return;
    }
    setForgotError('');
    setForgotSending(true);
    try {
      await authApi.forgotPassword(address);
      setForgotSentTo(address);
    } catch (err) {
      setForgotError(apiErrorMessage(err, 'Could not send the email. Try again in a minute.'));
    } finally {
      setForgotSending(false);
    }
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
        navigate(destination);
      } else {
        try {
          await login(email, password);
          navigate(destination);
        } catch (err) {
          if (apiErrorStatus(err) === 401) {
            setError('Invalid email or password.');
          } else {
            setError(apiErrorMessage(err, 'Login failed'));
          }
          setIsLoading(false);
        }
      }
    } catch (err) {
      // Handle registration errors
      if (apiErrorStatus(err) === 409) {
        setError('An account with this email already exists. Please sign in instead.');
      } else {
        setError(apiErrorMessage(err, 'An error occurred'));
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

              <div>
                <Input
                  label="Password"
                  type="password"
                  placeholder={authMode === 'signup' ? 'At least 8 characters' : 'Your password'}
                  autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                {authMode === 'signin' && (
                  <div className="mt-1.5 text-right">
                    <button
                      type="button"
                      onClick={openForgot}
                      className="text-sm font-semibold text-green-800 underline underline-offset-2"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </div>

              <Button type="submit" size="lg" fullWidth disabled={isLoading} className="mt-2">
                {isLoading ? 'One moment...' : authMode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </div>
        </div>
      </div>

      {showForgot && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowForgot(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="forgot-title"
            className="card w-full max-w-sm p-5 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {forgotSentTo ? (
              <>
                <h2 id="forgot-title" className="section-title text-xl mb-2">
                  Check your email
                </h2>
                <p className="text-gray-600 leading-relaxed mb-3">
                  If <span className="font-semibold text-gray-800 break-all">{forgotSentTo}</span> has
                  a Pick 6 account, a reset link is on its way. It works for 1 hour.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed mb-5">
                  Nothing after a few minutes? Check your spam folder, or try again.
                </p>
                <Button fullWidth onClick={() => setShowForgot(false)}>
                  Done
                </Button>
              </>
            ) : (
              <form onSubmit={handleForgot} noValidate>
                <h2 id="forgot-title" className="section-title text-xl mb-2">
                  Forgot your password?
                </h2>
                <p className="text-gray-600 leading-relaxed mb-4">
                  Enter the email you signed up with and we'll send you a link to choose a new one.
                </p>
                {forgotError && (
                  <div className="mb-4">
                    <ErrorMessage message={forgotError} />
                  </div>
                )}
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                />
                <div className="flex flex-col sm:flex-row gap-3 mt-5">
                  <Button type="submit" fullWidth disabled={forgotSending}>
                    {forgotSending ? 'Sending...' : 'Send reset link'}
                  </Button>
                  <Button type="button" variant="secondary" fullWidth onClick={() => setShowForgot(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
