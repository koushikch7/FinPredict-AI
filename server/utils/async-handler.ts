import type { RequestHandler } from 'express';

/** Wrap async route handlers so thrown errors propagate to the error middleware. */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
