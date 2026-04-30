import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { listIPOs, refreshIPOs, analyseIPO } from '../services/ipo.js';
import { resolveAIConfig } from '../services/ai.js';
import { db } from '../db/index.js';

export const ipoRouter = Router();
ipoRouter.use(authenticate);

ipoRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(listIPOs());
  }),
);

ipoRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const r = await refreshIPOs(req.user!.id);
    res.json(r);
  }),
);

ipoRouter.post(
  '/:id/analyse',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const row = db.prepare('SELECT * FROM ipos WHERE id = ?').get(id) as any;
    if (!row) return res.status(404).json({ error: 'IPO not found' });
    const cfg = resolveAIConfig(req.user!.id);
    const r = await analyseIPO(
      {
        name: row.name,
        symbol: row.symbol ?? undefined,
        open_date: row.open_date ?? undefined,
        close_date: row.close_date ?? undefined,
        price_band: row.price_band ?? undefined,
        status: row.status ?? undefined,
        source: row.source,
      },
      cfg,
    );
    db.prepare(
      `UPDATE ipos SET
         ai_recommendation = ?, ai_rating = ?, ai_risk_level = ?, ai_potential_pct = ?, ai_horizon = ?,
         ai_summary = ?, ai_strengths = ?, ai_risks = ?, ai_analyst_view = ?,
         analyzed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(
      r.recommendation, r.rating, r.risk_level, r.potential_pct, r.horizon,
      r.summary, JSON.stringify(r.strengths), JSON.stringify(r.risks), r.analyst_view, id,
    );
    res.json({ ok: true, ...r });
  }),
);
