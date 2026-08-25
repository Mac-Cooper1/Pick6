import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { generateToken } from '../utils/auth';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import prisma from '../lib/prisma';

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Register a new user
 * POST /api/auth/register
 * Body: { name: string, email: string, password: string }
 */
export async function register(req: Request, res: Response, next: any) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      throw new AppError('Name, email, and password are required', 400);
    }

    // Normalize whitespace; the signup form collects first + last but the
    // API contract stays a single name (scripts and tests create one-word
    // users, so no two-word requirement here)
    const normalizedName = String(name).trim().replace(/\s+/g, ' ');
    if (!normalizedName) {
      throw new AppError('Name is required', 400);
    }
    if (normalizedName.length > 60) {
      throw new AppError('Name must be 60 characters or fewer', 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format', 400);
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      throw new AppError('User with this email already exists', 409);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: normalizedName,
        email,
        passwordHash,
      },
    });

    const token = generateToken(user.id, user.email);

    res.status(201).json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login existing user
 * POST /api/auth/login
 * Body: { email: string, password: string }
 */
export async function login(req: Request, res: Response, next: any) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Same 401 whether the email is unknown or the password is wrong —
    // don't leak which accounts exist
    const passwordOk =
      user !== null && (await bcrypt.compare(password, user.passwordHash));

    if (!user || !passwordOk) {
      throw new AppError('Invalid email or password', 401);
    }

    const token = generateToken(user.id, user.email);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current user
 * GET /api/auth/me
 * Protected route
 */
export async function getCurrentUser(req: AuthRequest, res: Response, next: any) {
  try {
    const userId = req.userId!;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        leagueMembers: {
          include: {
            league: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      leagues: user.leagueMembers.map((lm) => ({
        id: lm.league.id,
        name: lm.league.name,
        joinCode: lm.league.joinCode,
      })),
    });
  } catch (error) {
    next(error);
  }
}
