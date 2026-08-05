/**
 * Admin gate for /api/admin/* routes. Two ways in:
 *  1. `x-admin-secret` header matching ADMIN_SECRET — for GitHub Actions cron
 *     (no user context).
 *  2. A valid JWT belonging to a user who is COMMISSIONER of at least one
 *     league — for the in-app "Sync now" button and manual fixes.
 * Everyone else gets 403.
 */

import { Response, NextFunction } from 'express';
import { MemberRole } from '@prisma/client';
import { AuthRequest } from '../types';
import { verifyToken } from '../utils/auth';
import prisma from '../lib/prisma';

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    // Path 1: shared secret (scheduled jobs)
    const configuredSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers['x-admin-secret'];
    if (
      configuredSecret &&
      typeof providedSecret === 'string' &&
      providedSecret === configuredSecret
    ) {
      return next();
    }

    // Path 2: commissioner JWT
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : null;

    if (token) {
      try {
        const payload = verifyToken(token);
        const commissionerOf = await prisma.leagueMember.findFirst({
          where: { userId: payload.userId, role: MemberRole.COMMISSIONER },
        });
        if (commissionerOf) {
          req.userId = payload.userId;
          return next();
        }
      } catch {
        // fall through to 403
      }
    }

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Admin access requires the admin secret or a commissioner account',
      statusCode: 403,
    });
  } catch (error) {
    next(error);
  }
}
