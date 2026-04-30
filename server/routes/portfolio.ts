import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { fetchYahooQuote } from '../services/prices.js';
import { brokerStore } from '../services/brokers/types.js';
import { fetchKiteLTPs } from '../services/brokers/kite.js';
import { config } from '../config.js';

export const portfolioRouter = Router();
portfolioRouter.use(authenticate);

portfolioRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = db
      .prepare(
        `SELECT p.id, p.stock_id, p.quantity, p.average_price, p.source, s.symbol, s.name, s.sector, s.exchange
         FROM portfolio p JOIN stocks s ON p.stock_id = s.id
         WHERE p.user_id = ?`,
      )
      .all(req.user!.id) as any[];

    // Preferred live-price source: Kite (if user has a valid token).
    // We bulk-fetch via getLTP to minimise API calls.
    const kiteAcc = brokerStore.get(req.user!.id, 'kite');
    let kitePrices = new Map<string, number>();
    if (kiteAcc?.access_token && items.length > 0) {
      const apiKey = kiteAcc.api_key || config.KITE_API_KEY;
      if (apiKey) {
        kitePrices = await fetchKiteLTPs(
          apiKey,
          kiteAcc.access_token,
          items.map((i) => ({ symbol: i.symbol, exchange: i.exchange })),
        );
      }
    }

    // Enrich with live prices: Kite first, Yahoo fallback, then average_price.
    const enriched = await Promise.all(
      items.map(async (it) => {
        const kitePx = kitePrices.get(it.symbol);
        let ltp = kitePx ?? null;
        let changePct: number | null = null;
        let priceSource: 'kite' | 'yahoo' | 'avg' = 'kite';
        if (ltp == null) {
          const q = await fetchYahooQuote(it.symbol, it.exchange);
          if (q?.price) {
            ltp = q.price;
            changePct = q.changePct ?? null;
            priceSource = 'yahoo';
          } else {
            ltp = it.average_price;
            priceSource = 'avg';
          }
        }
        const investedValue = it.quantity * it.average_price;
        const currentValue = it.quantity * (ltp as number);
        return {
          ...it,
          ltp,
          changePct,
          price_source: priceSource,
          invested_value: investedValue,
          current_value: currentValue,
          pnl: currentValue - investedValue,
          pnl_pct: investedValue ? ((currentValue - investedValue) / investedValue) * 100 : 0,
        };
      }),
    );
    res.json(enriched);
  }),
);

const AddSchema = z.object({
  stock_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  average_price: z.coerce.number().positive(),
});

portfolioRouter.post(
  '/',
  validate(AddSchema),
  asyncHandler(async (req, res) => {
    const { stock_id, quantity, average_price } = req.body as z.infer<typeof AddSchema>;
    const stock = db.prepare('SELECT id FROM stocks WHERE id = ?').get(stock_id);
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    db.prepare(
      `INSERT INTO portfolio (user_id, stock_id, quantity, average_price, source)
       VALUES (?, ?, ?, ?, 'manual')
       ON CONFLICT(user_id, stock_id) DO UPDATE SET
         quantity = excluded.quantity,
         average_price = excluded.average_price,
         source = 'manual',
         updated_at = CURRENT_TIMESTAMP`,
    ).run(req.user!.id, stock_id, quantity, average_price);
    res.json({ ok: true });
  }),
);

portfolioRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM portfolio WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  }),
);
