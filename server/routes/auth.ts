import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { authenticate, signToken, cookieOpts } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest, conflict, unauthorized } from '../utils/errors.js';
import { getOrCreateAccount } from '../services/paper-trading.js';

export const authRouter = Router();

const RegisterSchema = z.object({
  username: z.string().min(3).max(40),
  password: z.string().min(8).max(128),
  role: z.enum(['Viewer', 'Analyst', 'Admin', 'Super Admin']).optional(),
});

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post(
  '/register',
  validate(RegisterSchema),
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body as z.infer<typeof RegisterSchema>;
    const adminCount = (db
      .prepare("SELECT COUNT(*) as c FROM users WHERE role IN ('Admin', 'Super Admin')")
      .get() as { c: number }).c;

    let assignedRole = role || 'Viewer';
    if (assignedRole === 'Admin' || assignedRole === 'Super Admin') {
      if (adminCount > 0 || !config.ALLOW_FIRST_ADMIN_REGISTRATION) {
        throw new (await import('../utils/errors.js')).HttpError(403, 'Admin registration restricted');
      }
      assignedRole = 'Super Admin'; // first admin = super admin
    }

    const hash = await bcrypt.hash(password, 12);
    try {
      const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, assignedRole);
      const id = Number(info.lastInsertRowid);
      getOrCreateAccount(id, 100_000);
      res.json({ id, role: assignedRole });
    } catch {
      throw conflict('Username already exists');
    }
  }),
);

authRouter.post(
  '/login',
  validate(LoginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body as z.infer<typeof LoginSchema>;
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
    if (!user || !(await bcrypt.compare(password, user.password))) throw unauthorized('Invalid credentials');
    const u = { id: user.id, username: user.username, role: user.role };
    const token = signToken(u);
    res.cookie('token', token, cookieOpts());
    res.json({ user: u, token });
  }),
);

authRouter.get('/me', authenticate, (req, res) => {
  res.json(req.user);
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});
