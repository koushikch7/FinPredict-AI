import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { fetchYahooQuote, snapshotTechnicals } from '../services/prices.js';
import { notFound } from '../utils/errors.js';

export const stocksRouter = Router();
stocksRouter.use(authenticate);

stocksRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const list = db.prepare('SELECT * FROM stocks ORDER BY symbol').all();
    res.json(list);
  }),
);

const CreateSchema = z.object({
  symbol: z.string().min(1).max(20).transform((s) => s.toUpperCase()),
  name: z.string().min(1),
  sector: z.string().min(1),
  exchange: z.enum(['NSE', 'BSE']).default('NSE'),
});

stocksRouter.post(
  '/',
  authorize(['Analyst', 'Admin', 'Super Admin']),
  validate(CreateSchema),
  asyncHandler(async (req, res) => {
    const { symbol, name, sector, exchange } = req.body as z.infer<typeof CreateSchema>;
    const info = db
      .prepare('INSERT OR IGNORE INTO stocks (symbol, name, sector, exchange) VALUES (?, ?, ?, ?)')
      .run(symbol, name, sector, exchange);
    res.json({ id: Number(info.lastInsertRowid) });
  }),
);

stocksRouter.get(
  '/:symbol/quote',
  asyncHandler(async (req, res) => {
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(req.params.symbol.toUpperCase()) as any;
    if (!stock) throw notFound('Stock not found');
    const q = await fetchYahooQuote(stock.symbol, stock.exchange);
    res.json({ stock, quote: q });
  }),
);

stocksRouter.get(
  '/:symbol/history',
  asyncHandler(async (req, res) => {
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(req.params.symbol.toUpperCase()) as any;
    if (!stock) throw notFound('Stock not found');
    const { fetchYahooHistory } = await import('../services/prices.js');
    const days = Math.min(Number(req.query.days) || 90, 365);
    const candles = await fetchYahooHistory(stock.symbol, stock.exchange, days);
    res.json({ stock, candles });
  }),
);

stocksRouter.get(
  '/:symbol/technicals',
  asyncHandler(async (req, res) => {
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(req.params.symbol.toUpperCase()) as any;
    if (!stock) throw notFound('Stock not found');
    const tech = await snapshotTechnicals(stock.symbol, stock.exchange);
    res.json({ stock, technicals: tech });
  }),
);
