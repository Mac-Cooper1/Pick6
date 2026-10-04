import jwt from 'jsonwebtoken';

export interface JWTPayload {
  userId: number;
  email: string;
}

/**
 * JWT_SECRET is required — no fallback. Read lazily so dotenv/env validation
 * (which run in server.ts before any request) always precede first use.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Generate a JWT token for a user
 */
export function generateToken(userId: number, email: string): string {
  const payload: JWTPayload = { userId, email };
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    return jwt.verify(token, getJwtSecret()) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid token', { cause: error });
  }
}

// ---------- Password reset links ----------
// Signed with JWT_SECRET plus the user's current password hash, so a link
// stops working the moment the password changes: using one kills every
// other outstanding link too, with nothing stored. The different secret
// also means a reset token can never pass as a login token, or vice versa.

const RESET_PURPOSE = 'password-reset';
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // the email says "1 hour"

function resetSecret(passwordHash: string): string {
  return `${getJwtSecret()}:${passwordHash}`;
}

export function generatePasswordResetToken(
  userId: number,
  passwordHash: string,
  expiresInSeconds = RESET_TOKEN_TTL_SECONDS
): string {
  return jwt.sign({ userId, purpose: RESET_PURPOSE }, resetSecret(passwordHash), {
    expiresIn: expiresInSeconds,
  });
}

/** Whose reset token this claims to be (unverified: picks the hash to verify it with) */
export function resetTokenUserId(token: string): number | null {
  const payload = jwt.decode(token);
  if (!payload || typeof payload !== 'object' || payload.purpose !== RESET_PURPOSE) return null;
  return Number.isInteger(payload.userId) ? payload.userId : null;
}

export function verifyPasswordResetToken(token: string, passwordHash: string): boolean {
  try {
    const payload = jwt.verify(token, resetSecret(passwordHash), { algorithms: ['HS256'] });
    return typeof payload === 'object' && payload.purpose === RESET_PURPOSE;
  } catch {
    return false;
  }
}
