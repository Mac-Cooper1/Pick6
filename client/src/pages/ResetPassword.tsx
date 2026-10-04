import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiErrorMessage, apiErrorStatus } from '../services/api';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { ErrorMessage } from '../components/ErrorMessage';
import { Logo } from '../components/Logo';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Where the reset email's link lands: /reset-password#token=... The token
 * rides in the fragment, which browsers never send to a server, so it stays
 * out of request logs. Setting the new password signs the user in.
 */
export function ResetPassword() {
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  // From the router, so a link pasted into a tab already on this page (only
  // the #fragment changes, no reload) is picked up too
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [refusedToken, setRefusedToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const linkDead = !token || refusedToken === token;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match");
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message = apiErrorMessage(err, 'Could not reset your password. Try again.');
      if (apiErrorStatus(err) === 400 && message.includes('reset link')) {
        setRefusedToken(token);
      } else {
        setError(message);
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
        </div>
        <div className="hidden lg:block text-sm text-white/50">2026 season</div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md">
          {linkDead ? (
            <>
              <h1 className="section-title text-3xl sm:text-4xl mb-1">Link expired</h1>
              <p className="text-gray-600 mb-6">
                This reset link has expired or was already used. Links work for 1 hour, and only once.
              </p>
              <div className="card p-5 sm:p-7 space-y-3">
                <Button size="lg" fullWidth onClick={() => navigate('/login?forgot=1')}>
                  Send me a new link
                </Button>
                <Button size="lg" variant="secondary" fullWidth onClick={() => navigate('/login')}>
                  Back to sign in
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="section-title text-3xl sm:text-4xl mb-1">Choose a new password</h1>
              <p className="text-gray-600 mb-6">At least 8 characters. You'll be signed in right after.</p>

              <div className="card p-5 sm:p-7">
                {error && (
                  <div className="mb-4">
                    <ErrorMessage message={error} />
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <Input
                    label="New password"
                    type="password"
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Input
                    label="Confirm new password"
                    type="password"
                    placeholder="Same password again"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                  <Button type="submit" size="lg" fullWidth disabled={isLoading} className="mt-2">
                    {isLoading ? 'One moment...' : 'Save and sign in'}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
