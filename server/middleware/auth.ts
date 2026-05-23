import type { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { db } from '../db/index.js';
import { unauthorized, forbidden } from '../utils/errors.js';

export interface AuthUser {
  id: number;
  username: string;
  role: 'Viewer' | 'Analyst' | 'Admin' | 'Super Admin';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = req.cookies?.token || bearer;
  if (!token) return next(unauthorized());
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthUser & { iat: number; exp: number };
    // Verify the user still exists in the DB — catches stale JWTs after DB resets or user deletion
    const row = db
      .prepare('SELECT id, username, role FROM users WHERE id = ?')
      .get(decoded.id) as AuthUser | undefined;
    if (!row) return next(unauthorized('Session no longer valid — please log in again'));
    req.user = { id: row.id, username: row.username, role: row.role };
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
};

export const authorize =
  (roles: AuthUser['role'][]): RequestHandler =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };

export function signToken(user: AuthUser): string {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, config.JWT_SECRET, {
    expiresIn: '24h',
  });
}

export function cookieOpts() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax' as const,
    maxAge: 24 * 60 * 60 * 1000,
    path: '/',
  };
}
