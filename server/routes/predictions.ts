import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { generatePrediction, STRATEGIES, validatePendingPredictions, runTopPicks } from '../services/predictions.js';

export const predictionsRouter = Router();
predictionsRouter.use(authenticate);

predictionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const sort = (req.query.sort as string) || 'date';
    const orderBy = sort === 'profit' ? 'p.expected_move_p DESC' : 'p.created_at DESC';
    const list = db
      .prepare(
        `SELECT p.*, s.symbol, s.name FROM predictions p
         JOIN stocks s ON p.stock_id = s.id
         WHERE p.user_id = ?
         ORDER BY ${orderBy}
         LIMIT 200`,
      )
      .all(req.user!.id);
    res.json(list);
  }),
);

predictionsRouter.get(
  '/strategies',
  asyncHandler(async (_req, res) => {
    res.json(STRATEGIES);
  }),
);

const GenerateSchema = z.object({
  stock_id: z.coerce.number().int().positive(),
  horizon: z.enum(['2-7d', '1m', '3-12m', 'LT']),
  strategy: z.enum(['Buffett', 'Lynch', 'Graham', 'Momentum', 'MeanReversion', 'Balanced']).optional(),
});

predictionsRouter.post(
  '/generate',
  authorize(['Analyst', 'Admin', 'Super Admin', 'Viewer']),
  validate(GenerateSchema),
  asyncHandler(async (req, res) => {
    const { stock_id, horizon, strategy } = req.body as z.infer<typeof GenerateSchema>;
    const out = await generatePrediction({ userId: req.user!.id, stockId: stock_id, horizon, strategy });
    res.json(out);
  }),
);

predictionsRouter.post(
  '/validate',
  authorize(['Admin', 'Super Admin']),
  asyncHandler(async (_req, res) => {
    const r = await validatePendingPredictions();
    res.json(r);
  }),
);

const TopPicksSchema = z.object({
  limit: z.coerce.number().int().min(1).max(10).optional(),
  horizon: z.enum(['2-7d', '1m', '3-12m', 'LT']).optional(),
});
predictionsRouter.post(
  '/top-picks',
  authorize(['Analyst', 'Admin', 'Super Admin', 'Viewer']),
  asyncHandler(async (req, res) => {
    const parsed = TopPicksSchema.safeParse({ ...req.query, ...req.body });
    const limit = parsed.success ? parsed.data.limit ?? 5 : 5;
    const horizon = parsed.success ? parsed.data.horizon ?? '1m' : '1m';
    const picks = await runTopPicks(req.user!.id, limit, horizon);
    res.json({ picks, count: picks.length });
  }),
);

predictionsRouter.get(
  '/accuracy',
  asyncHandler(async (req, res) => {
    const stats = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN result = 'ACCURATE' THEN 1 ELSE 0 END) AS accurate,
           SUM(CASE WHEN result = 'PARTIAL' THEN 1 ELSE 0 END) AS partial,
           SUM(CASE WHEN result = 'FAILED'  THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending
         FROM predictions WHERE user_id = ?`,
      )
      .get(req.user!.id) as any;
    const validated = (stats.total ?? 0) - (stats.pending ?? 0);
    res.json({
      ...stats,
      accuracy_pct: validated > 0 ? ((stats.accurate ?? 0) / validated) * 100 : null,
    });
  }),
);
