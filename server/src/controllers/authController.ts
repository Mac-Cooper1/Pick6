import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../utils/auth';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

/**
 * Register a new user or login existing user
 * POST /api/auth/register
 * Body: { name: string, email: string }
 */
export async function register(req: Request, res: Response, next: any) {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      throw new AppError('Name and email are required', 400);
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format', 400);
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      throw new AppError('User with this email already exists', 409);
    }

    // Create new user
    user = await prisma.user.create({
      data: {
        name,
        email,
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
 * Body: { email: string }
 */
export async function login(req: Request, res: Response, next: any) {
  try {
    const { email } = req.body;

    if (!email) {
      throw new AppError('Email is required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new AppError('User not found', 404);
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
