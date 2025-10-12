import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

/**
 * Global error handler middleware
 */
export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  const errorResponse: ErrorResponse = {
    error: error.name || 'Error',
    message,
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
