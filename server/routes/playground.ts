import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  getOrCreateAccount,
  resetAccount,
  updateAccountSettings,
  getPositions,
  getTrades,
  getEquityCurve,
  executeTrade,
  recomputeEquity,
  runAITraderCycle,
  detectMarketRegime,
  getStrategyStats,
} from '../services/paper-trading.js';
import { fetchYahooQuote, latestPrice } from '../services/prices.js';
import { brokerStore } from '../services/brokers/types.js';
import { badRequest } from '../utils/errors.js';
import { isNseOpen } from '../utils/market-hours.js';
import { config } from '../config.js';
import { resolveAIConfig } from '../services/ai.js';
import { topBuyPicks } from '../services/discovery.js';

export const playgroundRouter = Router();
playgroundRouter.use(authenticate);

playgroundRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const acc = getOrCreateAccount(req.user!.id);
    const positions = getPositions(acc.id);
    const enrichedPositions = await Promise.all(
      positions.map(async (p) => {
        const q = await fetchYahooQuote(p.symbol, p.exchange);
        const ltp = q?.price ?? p.average_price;
        const value = p.quantity * ltp;
        const invested = p.quantity * p.average_price;
        return {
          ...p,
          ltp,
          value,
          invested,
          pnl: value - invested,
          pnl_pct: invested ? ((value - invested) / invested) * 100 : 0,
        };
      }),
    );
    const equityNow = enrichedPositions.reduce((s, p) => s + p.value, 0);
    const lastAiTrade = db
      .prepare(
        `SELECT t.executed_at, s.symbol, t.side, t.quantity, t.ai_provider, t.ai_model, t.ai_upstream_model, t.ai_latency_ms
         FROM paper_trades t JOIN stocks s ON t.stock_id = s.id
         WHERE t.account_id = ? AND t.ai_decision = 1
         ORDER BY t.id DESC LIMIT 1`,
      )
      .get(acc.id) as { executed_at: string; symbol: string; side: string; quantity: number } | undefined;
    const aiTradesToday = (db
      .prepare(
        `SELECT COUNT(*) c FROM paper_trades
         WHERE account_id = ? AND ai_decision = 1
           AND DATE(executed_at, '+05:30') = DATE('now', '+05:30')`,
      )
      .get(acc.id) as { c: number }).c;

    // Daily drawdown so the UI can render a kill-switch progress gauge.
    const yesterdayClose = db.prepare(
      `SELECT total FROM paper_equity_curve WHERE account_id = ?
         AND DATE(timestamp, '+05:30') < DATE('now', '+05:30')
       ORDER BY id DESC LIMIT 1`,
    ).get(acc.id) as { total: number } | undefined;
    const dailyDdPct =
      yesterdayClose && yesterdayClose.total > 0
        ? ((acc.cash + equityNow - yesterdayClose.total) / yesterdayClose.total) * 100
        : null;

    // Effective universe the AI actually reasons about
    let configuredUniverse: string[] = [];
    try { configuredUniverse = JSON.parse(acc.universe ?? '[]'); } catch {}
    let universeMode: 'custom' | 'auto' = configuredUniverse.length ? 'custom' : 'auto';
    let effectiveUniverse = configuredUniverse;
    if (universeMode === 'auto') {
      const buys = topBuyPicks(15);
      const watch = (db.prepare(
        `SELECT s.symbol FROM watchlist w JOIN stocks s ON w.stock_id = s.id WHERE w.user_id = ?`,
      ).all(req.user!.id) as { symbol: string }[]).map((r) => r.symbol);
      const held = enrichedPositions.map((p) => p.symbol);
      effectiveUniverse = [...new Set([...buys, ...watch, ...held])].slice(0, 18);
    }

    const aiCfg = resolveAIConfig(req.user!.id);
    res.json({
      account: acc,
      positions: enrichedPositions,
      cash: acc.cash,
      equity: equityNow,
      total: acc.cash + equityNow,
      pnl_pct: ((acc.cash + equityNow - acc.starting_capital) / acc.starting_capital) * 100,
      market_open: isNseOpen(),
      effective_universe: effectiveUniverse,
      universe_mode: universeMode,
      ai_status: {
        auto_trade: !!acc.auto_trade,
        cron: config.PLAYGROUND_CRON,
        paused_until: acc.paused_until,
        last_ai_trade: lastAiTrade ?? null,
        ai_trades_today: aiTradesToday,
        daily_dd_pct: dailyDdPct,
        daily_dd_threshold: -acc.max_daily_loss_pct,
        provider: aiCfg.provider,
        model: aiCfg.model,
        provider_source: aiCfg.source,
      },
    });
  }),
);

playgroundRouter.get('/trades', (req, res) => {
  const acc = getOrCreateAccount(req.user!.id);
  res.json(getTrades(acc.id));
});

playgroundRouter.get('/equity-curve', (req, res) => {
  const acc = getOrCreateAccount(req.user!.id);
  res.json(getEquityCurve(acc.id));
});

const ResetSchema = z.object({ starting_capital: z.coerce.number().positive() });
playgroundRouter.post(
  '/reset',
  validate(ResetSchema),
  asyncHandler(async (req, res) => {
    const acc = resetAccount(req.user!.id, (req.body as any).starting_capital);
    res.json({ account: acc });
  }),
);

const SettingsSchema = z.object({
  auto_trade: z.boolean().optional(),
  strategy: z.enum(['Buffett', 'Lynch', 'Graham', 'Momentum', 'MeanReversion', 'Balanced']).optional(),
  risk_level: z.enum(['Conservative', 'Moderate', 'Aggressive']).optional(),
  universe: z.array(z.string()).optional(),
  max_position_pct: z.coerce.number().min(1).max(100).optional(),
  stop_loss_pct: z.coerce.number().min(0.5).max(50).optional(),
  take_profit_pct: z.coerce.number().min(1).max(200).optional(),
  max_daily_loss_pct: z.coerce.number().min(0.5).max(50).optional(),
});
playgroundRouter.post(
  '/settings',
  validate(SettingsSchema),
  asyncHandler(async (req, res) => {
    updateAccountSettings(req.user!.id, req.body as any);
    res.json({ ok: true });
  }),
);

const TradeSchema = z.object({
  symbol: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  quantity: z.coerce.number().positive(),
  horizon: z.enum(['Intraday', 'Short-term', 'Long-term']).optional(),
  reason: z.string().max(500).optional(),
  strategy_tag: z.string().max(40).optional(),
});
playgroundRouter.post(
  '/trade',
  validate(TradeSchema),
  asyncHandler(async (req, res) => {
    const { symbol, side, quantity, horizon, reason, strategy_tag } = req.body as z.infer<typeof TradeSchema>;
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(symbol.toUpperCase()) as any;
    if (!stock) throw badRequest('Unknown symbol');
    const q = await fetchYahooQuote(stock.symbol, stock.exchange);
    const livePrice = q?.price ?? latestPrice(stock.id);
    if (!livePrice) throw badRequest('Could not fetch live price — Yahoo is unavailable and no cached price exists');
    const acc = getOrCreateAccount(req.user!.id);
    // Defence-in-depth: even though executeTrade rejects insufficient cash,
    // surface a friendlier error here for the manual trade UX.
    if (side === 'BUY') {
      const need = livePrice * quantity * 1.001;
      if (need > acc.cash) {
        throw badRequest(`Insufficient cash: need ₹${need.toFixed(2)}, available ₹${acc.cash.toFixed(2)}`);
      }
    }
    const regime = detectMarketRegime([stock.symbol]).regime;
    executeTrade({
      accountId: acc.id,
      stockId: stock.id,
      side,
      quantity,
      price: livePrice,
      reason: reason ?? 'manual',
      horizon,
      strategy_tag: strategy_tag ?? 'manual',
      market_regime: regime,
    });
    await recomputeEquity(acc.id);
    res.json({ ok: true, executed_price: livePrice, price_source: q ? 'live' : 'cached' });
  }),
);

playgroundRouter.get('/strategy-stats', (req, res) => {
  const acc = getOrCreateAccount(req.user!.id);
  res.json(getStrategyStats(acc.id));
});

// Live quote for the manual-trade modal so the UI can show LTP + cap qty.
playgroundRouter.get(
  '/quote/:symbol',
  asyncHandler(async (req, res) => {
    const sym = String(req.params.symbol).toUpperCase();
    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(sym) as any;
    if (!stock) throw badRequest('Unknown symbol');
    const q = await fetchYahooQuote(stock.symbol, stock.exchange);
    const quotePrice = q?.price ?? latestPrice(stock.id);
    if (!quotePrice) throw badRequest('Could not fetch live price — Yahoo is unavailable and no cached price exists');
    res.json({ symbol: sym, price: quotePrice, exchange: stock.exchange, stale: !q });
  }),
);

playgroundRouter.post(
  '/run-ai',
  asyncHandler(async (req, res) => {
    // Manual run: bypass auto_trade gate, the user explicitly asked.
    const r = await runAITraderCycle(req.user!.id, { manual: true });
    res.json(r);
  }),
);
