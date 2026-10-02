import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

/**
 * Global error handler middleware. AppErrors and Express's own client
 * errors (body-parser marks its 4xx with `expose`) are written for the
 * client. Anything else is a bug or an outage: the client gets a generic
 * message, and the details (Prisma's name the database host and the
 * failing query) stay in the server log.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // Unused, but Express only treats 4-argument middleware as an error handler
  _next: NextFunction
) {
  console.error('Error:', error);

  const { statusCode: code, expose } = (error ?? {}) as { statusCode?: unknown; expose?: unknown };
  const statusCode = typeof code === 'number' && code >= 400 && code < 600 ? code : 500;
  const forClient = error instanceof Error && (error instanceof AppError || expose === true);

  const errorResponse: ErrorResponse = {
    error: forClient ? error.name : 'Error',
    message: forClient
      ? error.message || 'Request failed'
      : statusCode < 500
        ? 'Bad request'
        : 'Internal server error',
    statusCode,
  };

  res.status(statusCode).json(errorResponse);
}

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
