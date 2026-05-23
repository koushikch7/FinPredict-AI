import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { configStore, userSettings } from '../services/config-store.js';
import { resolveAIConfig, aiHealthcheck, listAIModels, getRecentAICalls } from '../services/ai.js';
import { getBroker } from '../services/brokers/index.js';
import { brokerStore } from '../services/brokers/types.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';

export const adminRouter = Router();
adminRouter.use(authenticate);

// ─── Configuration ──────────────────────────────────────────────
adminRouter.get('/config', authorize(['Admin', 'Super Admin']), (_req, res) => {
  res.json(configStore.getAll());
});

const ConfigSchema = z.object({ key: z.string().min(1), value: z.string(), category: z.string().optional() });
adminRouter.post(
  '/config',
  authorize(['Admin', 'Super Admin']),
  validate(ConfigSchema),
  asyncHandler(async (req, res) => {
    const { key, value, category } = req.body as z.infer<typeof ConfigSchema>;
    configStore.set(key, value, category ?? 'General');
    res.json({ ok: true });
  }),
);

// ─── AI ─────────────────────────────────────────────────────────
adminRouter.get(
  '/ai/test',
  authorize(['Admin', 'Super Admin']),
  asyncHandler(async (_req, res) => {
    const cfg = resolveAIConfig();
    const r = await aiHealthcheck(cfg);
    res.json(r);
  }),
);

adminRouter.get(
  '/ai/models',
  authorize(['Admin', 'Super Admin']),
  asyncHandler(async (_req, res) => {
    const cfg = resolveAIConfig();
    const models = await listAIModels(cfg);
    res.json(models);
  }),
);

// Diagnostics: resolved config + last 100 AI calls (provider/model/latency/caller).
adminRouter.get(
  '/ai/diag',
  authorize(['Admin', 'Super Admin']),
  (_req, res) => {
    const cfg = resolveAIConfig();
    res.json({
      config: {
        provider: cfg.provider,
        model: cfg.model,
        baseURL: cfg.baseURL,
        source: cfg.source,
        hasKey: !!cfg.apiKey,
      },
      recent: getRecentAICalls(),
    });
  },
);

// User-level AI override (any authenticated user)
adminRouter.get('/me/ai', (req, res) => {
  const s = userSettings.all(req.user!.id);
  res.json({
    AI_PROVIDER: s.AI_PROVIDER ?? '',
    AI_MODEL: s.AI_MODEL ?? '',
    AI_BASE_URL: s.AI_BASE_URL ?? '',
    has_key: !!s.AI_API_KEY,
  });
});

const UserAISchema = z.object({
  AI_PROVIDER: z.enum(['Gemini', 'OpenAI', 'Arbiter']).optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
});
adminRouter.post(
  '/me/ai',
  validate(UserAISchema),
  asyncHandler(async (req, res) => {
    const u = req.user!.id;
    const body = req.body as z.infer<typeof UserAISchema>;
    if (body.AI_PROVIDER) userSettings.set(u, 'AI_PROVIDER', body.AI_PROVIDER);
    if (body.AI_API_KEY != null) userSettings.set(u, 'AI_API_KEY', body.AI_API_KEY);
    if (body.AI_MODEL) userSettings.set(u, 'AI_MODEL', body.AI_MODEL);
    if (body.AI_BASE_URL != null) userSettings.set(u, 'AI_BASE_URL', body.AI_BASE_URL);
    res.json({ ok: true });
  }),
);

adminRouter.post(
  '/me/ai/test',
  asyncHandler(async (req, res) => {
    const cfg = resolveAIConfig(req.user!.id);
    const r = await aiHealthcheck(cfg);
    res.json(r);
  }),
);

// ─── Users ──────────────────────────────────────────────────────
adminRouter.get('/users', authorize(['Admin', 'Super Admin']), (_req, res) => {
  res.json(db.prepare('SELECT id, username, role, created_at FROM users').all());
});

const UserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(8),
  role: z.enum(['Viewer', 'Analyst', 'Admin', 'Super Admin']),
});
adminRouter.post(
  '/users',
  authorize(['Admin', 'Super Admin']),
  validate(UserSchema),
  asyncHandler(async (req, res) => {
    const { username, password, role } = req.body as z.infer<typeof UserSchema>;
    const hash = await bcrypt.hash(password, 12);
    const info = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run(username, hash, role);
    res.json({ id: Number(info.lastInsertRowid) });
  }),
);

adminRouter.delete(
  '/users/:id',
  authorize(['Admin', 'Super Admin']),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid user id');
    if (id === req.user!.id) throw badRequest('Cannot delete your own account');
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
    if (!target) throw notFound('User not found');
    if (target.role === 'Super Admin' && req.user!.role !== 'Super Admin') {
      throw forbidden('Only a Super Admin can delete another Super Admin');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.json({ ok: true });
  }),
);

// ─── Sync logs ─────────────────────────────────────────────────
adminRouter.get('/sync/logs', authorize(['Admin', 'Super Admin']), (_req, res) => {
  res.json(db.prepare('SELECT * FROM sync_logs ORDER BY id DESC LIMIT 100').all());
});

// ─── Broker test ────────────────────────────────────────────────
adminRouter.post(
  '/broker/:name/test',
  authorize(['Admin', 'Super Admin']),
  asyncHandler(async (req, res) => {
    const acc = brokerStore.get(req.user!.id, req.params.name as any);
    if (!acc?.api_key || !acc?.access_token) return res.json({ ok: false, message: 'Not connected' });
    try {
      const adapter = getBroker(req.params.name as any);
      const h = await adapter.fetchHoldings({ apiKey: acc.api_key, accessToken: acc.access_token });
      res.json({ ok: true, message: `Connected. ${h.length} holdings.` });
    } catch (e: any) {
      res.json({ ok: false, message: e.message });
    }
  }),
);
