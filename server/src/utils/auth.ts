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
    throw new Error('Invalid token');
  }
}
