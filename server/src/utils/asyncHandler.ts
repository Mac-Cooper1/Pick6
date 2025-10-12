import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper function to catch async errors in Express route handlers
 * Usage: asyncHandler(yourAsyncFunction)
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
