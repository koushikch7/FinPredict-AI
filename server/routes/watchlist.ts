import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { fetchYahooQuote } from '../services/prices.js';

export const watchlistRouter = Router();
watchlistRouter.use(authenticate);

watchlistRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = db
      .prepare(
        `SELECT w.id, w.stock_id, w.note, w.created_at, s.symbol, s.name, s.sector, s.exchange
         FROM watchlist w JOIN stocks s ON w.stock_id = s.id
         WHERE w.user_id = ? ORDER BY w.created_at DESC`,
      )
      .all(req.user!.id) as any[];
    const out = await Promise.all(
      items.map(async (i) => {
        const q = await fetchYahooQuote(i.symbol, i.exchange);
        return { ...i, ltp: q?.price ?? null, changePct: q?.changePct ?? null };
      }),
    );
    res.json(out);
  }),
);

const AddSchema = z.object({
  stock_id: z.coerce.number().int().positive(),
  note: z.string().max(500).optional(),
});

watchlistRouter.post(
  '/',
  validate(AddSchema),
  asyncHandler(async (req, res) => {
    const { stock_id, note } = req.body as z.infer<typeof AddSchema>;
    db.prepare(
      `INSERT INTO watchlist (user_id, stock_id, note) VALUES (?, ?, ?)
       ON CONFLICT(user_id, stock_id) DO UPDATE SET note = excluded.note`,
    ).run(req.user!.id, stock_id, note ?? null);
    res.json({ ok: true });
  }),
);

watchlistRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM watchlist WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
);
