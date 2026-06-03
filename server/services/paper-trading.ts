import { db } from '../db/index.js';
import { resolveAIConfig, aiCompleteMeta, type AICallRecord } from './ai.js';
import { fetchYahooQuote } from './prices.js';
import { buildContext } from './predictions.js';
import { fetchMarketNews } from './news.js';
import { getSymbolSentiment, getMarketSentiment } from './sentiment.js';
import { computeConviction, getPredictionAccuracy } from './conviction.js';
import { isNseOpen } from '../utils/market-hours.js';
import { logger } from '../logger.js';
import { topBuyPicks, listOpportunities } from './discovery.js';

// ══════════════════════════════════════════════════════════════════════════════
// Realistic Indian Stock Market Charges (Delivery/CNC)
// ══════════════════════════════════════════════════════════════════════════════
// Modeled on discount brokers (Zerodha/Groww): flat ₹20 or 0.03% whichever lower
const BROKERAGE_PCT = 0.0003;       // 0.03%
const BROKERAGE_CAP = 20;           // ₹20 max per order
const STT_DELIVERY_PCT = 0.001;     // 0.1% on both BUY and SELL for delivery
const EXCHANGE_TXN_PCT = 0.0000345; // NSE: 0.00345%
const GST_PCT = 0.18;              // 18% on brokerage + exchange charges
const SEBI_PER_CRORE = 10;         // ₹10 per crore of turnover
const STAMP_DUTY_BUY_PCT = 0.00015; // 0.015% on buy side only

// Tax rates (configurable per account later)
const STCG_RATE = 0.15;  // 15% short-term capital gains (<1yr holding)
const LTCG_RATE = 0.10;  // 10% long-term capital gains (>1yr, above ₹1L exemption)

/** Calculate realistic charges for a trade */
function calculateCharges(side: 'BUY' | 'SELL', grossAmount: number): {
  brokerage: number; stt: number; exchangeTxn: number; gst: number;
  sebi: number; stampDuty: number; totalCharges: number;
} {
  const brokerage = Math.min(grossAmount * BROKERAGE_PCT, BROKERAGE_CAP);
  const stt = grossAmount * STT_DELIVERY_PCT; // delivery: both sides
  const exchangeTxn = grossAmount * EXCHANGE_TXN_PCT;
  const gst = (brokerage + exchangeTxn) * GST_PCT;
  const sebi = (grossAmount / 10_000_000) * SEBI_PER_CRORE;
  const stampDuty = side === 'BUY' ? grossAmount * STAMP_DUTY_BUY_PCT : 0;
  const totalCharges = brokerage + stt + exchangeTxn + gst + sebi + stampDuty;
  return { brokerage, stt, exchangeTxn, gst, sebi, stampDuty, totalCharges };
}

/** Estimate minimum price move needed to break even after all charges + STCG tax */
function minimumBreakevenPct(buyPrice: number, quantity: number): number {
  const buyGross = buyPrice * quantity;
  const buyCharges = calculateCharges('BUY', buyGross).totalCharges;
  // Assume sell at same price initially to estimate sell charges
  const sellCharges = calculateCharges('SELL', buyGross).totalCharges;
  const totalCost = buyCharges + sellCharges;
  // After STCG tax, you keep only (1 - STCG_RATE) of profit
  // profit_after_tax = (sellGross - buyGross - totalCost) * (1 - STCG_RATE)
  // For break-even: (move * quantity - totalCost) * (1 - STCG_RATE) >= 0
  // move >= totalCost / quantity
  const breakEvenMove = totalCost / quantity;
  return (breakEvenMove / buyPrice) * 100; // as percentage
}

// Trading quality thresholds


/**
 * FP-1.20.1: 5-day rolling peak-to-trough drawdown.
 * Returns the percentage drop from the highest equity in the trailing
 * window. Used as a soft circuit breaker that throttles or blocks new
 * BUYs when the account is in a sustained drawdown — even if today
 * alone hasn't tripped the daily kill-switch.
 */
function computeRollingDrawdown(accountId: number, windowDays = 5): { peak: number; current: number; ddPct: number } {
  const row = db
    .prepare(
      `SELECT MAX(total) AS peak FROM paper_equity_curve
       WHERE account_id = ? AND timestamp >= datetime('now', ?)`,
    )
    .get(accountId, `-${windowDays} days`) as { peak: number | null } | undefined;
  const peak = row?.peak ?? 0;
  const cur = db.prepare(
    'SELECT total FROM paper_equity_curve WHERE account_id = ? ORDER BY id DESC LIMIT 1',
  ).get(accountId) as { total: number } | undefined;
  const current = cur?.total ?? 0;
  if (!peak || !current) return { peak, current, ddPct: 0 };
  return { peak, current, ddPct: ((current - peak) / peak) * 100 };
}

/**
 * FP-1.20.1: Kelly-criterion-inspired position-sizing multiplier.
 * Input: strategy_pnl rows for this account (already filtered to SELLs with
 * realized P&L). Output: a multiplier in [0.3, 1.5] that scales the AI's
 * suggested quantity based on the historical edge of the strategy_tag.
 *
 * f* = (b·p - q) / b, where:
 *   p = win rate, q = 1-p, b = avg_win/avg_loss
 * We then clip to [0.3, 1.5] so a single hot streak can't 5x sizes and a
 * bad streak can't shrink to zero (already handled by drawdown breaker).
 */
function kellySizingFactor(
  stats: Array<{ strategy_tag: string; win_rate_pct: number; trades: number; avg_pnl: number }>,
  strategyTag: string,
  conviction: number,
): number {
  if (!strategyTag) return 1.0;
  const stat = stats.find((s) => s.strategy_tag === strategyTag);
  if (!stat || stat.trades < 5) return 1.0; // not enough data — use AI's call

  const p = stat.win_rate_pct / 100;
  if (p <= 0 || p >= 1) return 1.0;
  // Use signed avg_pnl as proxy for net edge — if it's negative, throttle hard
  if (stat.avg_pnl <= 0) return 0.4;

  // Without separate win/loss size, approximate b ≈ 1 + (avg_pnl / 1000) so
  // strategies with bigger absolute wins get a small boost. This is a
  // conservative approximation; over time we can split by sign of pnl.
  const b = 1 + Math.min(2, Math.max(0.2, Math.abs(stat.avg_pnl) / 1000));
  const q = 1 - p;
  let f = (b * p - q) / b;
  // Conviction tempers the edge: scale by conviction (0..1).
  f = f * Math.max(0.5, conviction);
  // Clip
  return Math.max(0.3, Math.min(1.5, 1 + f));
}

/**
 * FP-1.20.1: Tiered trailing-stop give-back.
 * Tighter trail as profits grow — once you have real gains, protect them.
 *   0-5%:   no trail (just stop_loss_pct hard floor)
 *   5-15%:  50% give-back from peak
 *   15-30%: 35% give-back
 *   >30%:   25% give-back
 */
function tieredTrailGiveback(peakGainPct: number): number | null {
  if (peakGainPct < 5) return null;
  if (peakGainPct < 15) return Math.max(2, peakGainPct * 0.50);
  if (peakGainPct < 30) return Math.max(4, peakGainPct * 0.35);
  return Math.max(8, peakGainPct * 0.25);
}



/**
 * FP-1.20.1: programmatic sector concentration cap (the AI prompt already
 * mentions "30 percent per sector" but we now ENFORCE it server-side so
 * the AI can't accidentally pile into one sector during a hot streak).
 */
function sectorExposurePct(accountId: number, sectorName: string, totalEquity: number, addNotional: number): number {
  if (!sectorName || !totalEquity) return 0;
  // paper_positions has no `last_price` column (schema: quantity, average_price);
  // referencing it threw "no such column: p.last_price" on every BUY. Use the
  // cost-basis (average_price) as the notional proxy for the sector cap.
  const row = db.prepare(
    `SELECT COALESCE(SUM(p.quantity * p.average_price), 0) AS notional
       FROM paper_positions p JOIN stocks s ON p.stock_id = s.id
      WHERE p.account_id = ? AND s.sector = ?`,
  ).get(accountId, sectorName) as { notional: number };
  return ((row.notional + addNotional) / totalEquity) * 100;
}

/**
 * FP-1.20.1: liquidity floor — average daily turnover over last 20 sessions.
 * Returns null when we have no price history (treat as "unknown — be careful").
 */
function avgDailyTurnover20d(stockId: number): number | null {
  // NOTE: stock_prices has columns `timestamp` and `price` (and an often-empty
  // `close`). The original query referenced a non-existent `date` column which
  // threw "no such column: date" on EVERY buy — silently blocking all AI buys.
  // We now use `timestamp` and fall back to `price` when `close` is null.
  const row = db.prepare(
    `SELECT AVG(COALESCE(close, price) * volume) AS tov, COUNT(*) AS n
       FROM stock_prices
      WHERE stock_id = ? AND timestamp >= datetime('now','-30 days')`,
  ).get(stockId) as { tov: number | null; n: number };
  if (!row.tov || row.n < 5) return null;
  return row.tov;
}

const LIQUIDITY_FLOOR_INR = 2_00_00_000; // 2 crore — bare minimum for paper-trading; real money should be 5cr+

/**
 * FP-1.20.1: intraday horizon eligibility — only run intraday on liquid
 * mid+ tier names during regular NSE hours with enough time left in the
 * session to enter + exit before 3:25 PM IST.
 */
function isIntradayEligible(tier: string | null, now = new Date()): { ok: boolean; reason?: string } {
  if (!tier || !['large', 'mid'].includes(tier)) {
    return { ok: false, reason: `intraday requires tier large|mid, got ${tier}` };
  }
  // IST = UTC + 5:30
  const istMs = now.getTime() + 5.5 * 3600 * 1000;
  const ist = new Date(istMs);
  const hh = ist.getUTCHours();
  const mm = ist.getUTCMinutes();
  // Market: 09:15 - 15:30 IST. Allow new intraday entries up to 14:30 IST
  // so there's time for at least a 1-hour move + 25 min square-off buffer.
  const t = hh * 100 + mm;
  if (t < 915 || t > 1430) {
    return { ok: false, reason: `intraday window 09:15-14:30 IST (currently ${hh}:${String(mm).padStart(2, '0')} IST)` };
  }
  return { ok: true };
}

const MIN_CONVICTION_BUY = 0.70;      // Only buy with high conviction
const MIN_CONVICTION_SELL = 0.50;     // Lower bar for sells (capital preservation)
const MAX_BUYS_PER_CYCLE = 3;         // Quality over quantity
const TRAILING_STOP_PCT = 4;          // Trail 4% below peak
const MIN_REWARD_RISK_RATIO = 2.0;    // Expected gain must be 2x potential loss
const SECTOR_CAP_PCT = 30;            // Max % of total equity in any one sector

const DEFAULT_UNIVERSE = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'ITC', 'SBIN', 'LT', 'BHARTIARTL', 'MARUTI'];

export interface PaperAccount {
  id: number;
  user_id: number;
  starting_capital: number;
  cash: number;
  auto_trade: number;
  strategy: string;
  risk_level: string;
  universe: string | null;
  max_position_pct: number;
  stop_loss_pct: number;
  take_profit_pct: number;
  max_daily_loss_pct: number;
  paused_until: string | null;
}

export interface PaperPositionRow {
  id: number;
  account_id: number;
  stock_id: number;
  quantity: number;
  average_price: number;
  symbol: string;
  exchange: string;
}

export function getOrCreateAccount(userId: number, startingCapital = 100_000): PaperAccount {
  const existing = db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').get(userId) as PaperAccount | undefined;
  if (existing) return existing;
  db.prepare(
    `INSERT INTO paper_accounts (user_id, starting_capital, cash, universe)
     VALUES (?, ?, ?, ?)`,
  // FP-1.20.1: new accounts default to AUTO universe so the AI uses the
  // full discovery output + watchlist + tier-stratified sample, not just
  // the 10 fixed blue-chips that DEFAULT_UNIVERSE used to lock you into.
  ).run(userId, startingCapital, startingCapital, null);
  return db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').get(userId) as PaperAccount;
}

export function resetAccount(userId: number, startingCapital: number) {
  const acc = getOrCreateAccount(userId, startingCapital);
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM paper_positions WHERE account_id = ?').run(acc.id);
    db.prepare('DELETE FROM paper_trades WHERE account_id = ?').run(acc.id);
    db.prepare('DELETE FROM paper_equity_curve WHERE account_id = ?').run(acc.id);
    db.prepare(
      `UPDATE paper_accounts SET starting_capital = ?, cash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    ).run(startingCapital, startingCapital, acc.id);
  });
  tx();
  return getOrCreateAccount(userId);
}

export function updateAccountSettings(
  userId: number,
  updates: Partial<{
    auto_trade: boolean;
    strategy: string;
    risk_level: string;
    universe: string[];
    max_position_pct: number;
    stop_loss_pct: number;
    take_profit_pct: number;
    max_daily_loss_pct: number;
  }>,
) {
  const acc = getOrCreateAccount(userId);
  // If risk_level changes and explicit knobs not provided, derive defaults.
  let derived: Partial<typeof updates> = {};
  if (updates.risk_level && updates.max_position_pct == null) {
    const presets: Record<string, { max_position_pct: number; stop_loss_pct: number; take_profit_pct: number; max_daily_loss_pct: number }> = {
      Conservative: { max_position_pct: 10, stop_loss_pct: 5, take_profit_pct: 15, max_daily_loss_pct: 3 },
      Moderate:     { max_position_pct: 20, stop_loss_pct: 8, take_profit_pct: 25, max_daily_loss_pct: 5 },
      Aggressive:   { max_position_pct: 33, stop_loss_pct: 12, take_profit_pct: 40, max_daily_loss_pct: 8 },
    };
    derived = presets[updates.risk_level] ?? {};
  }
  const merged = { ...derived, ...updates };
  db.prepare(
    `UPDATE paper_accounts SET
       auto_trade = COALESCE(?, auto_trade),
       strategy = COALESCE(?, strategy),
       risk_level = COALESCE(?, risk_level),
       universe = COALESCE(?, universe),
       max_position_pct = COALESCE(?, max_position_pct),
       stop_loss_pct = COALESCE(?, stop_loss_pct),
       take_profit_pct = COALESCE(?, take_profit_pct),
       max_daily_loss_pct = COALESCE(?, max_daily_loss_pct),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    merged.auto_trade == null ? null : merged.auto_trade ? 1 : 0,
    merged.strategy ?? null,
    merged.risk_level ?? null,
    merged.universe ? JSON.stringify(merged.universe) : null,
    merged.max_position_pct ?? null,
    merged.stop_loss_pct ?? null,
    merged.take_profit_pct ?? null,
    merged.max_daily_loss_pct ?? null,
    acc.id,
  );
}

export function getPositions(accountId: number): PaperPositionRow[] {
  return db
    .prepare(
      `SELECT pp.*, s.symbol, s.exchange FROM paper_positions pp
       JOIN stocks s ON pp.stock_id = s.id WHERE pp.account_id = ?`,
    )
    .all(accountId) as PaperPositionRow[];
}

export function getTrades(accountId: number, limit = 100) {
  return db
    .prepare(
      `SELECT t.*, s.symbol FROM paper_trades t JOIN stocks s ON t.stock_id = s.id
       WHERE t.account_id = ? ORDER BY t.id DESC LIMIT ?`,
    )
    .all(accountId, limit);
}

export function getEquityCurve(accountId: number, limit = 500) {
  return db
    .prepare(
      `SELECT cash, equity, total, timestamp FROM paper_equity_curve
       WHERE account_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(accountId, limit)
    .reverse();
}

interface ExecuteOpts {
  accountId: number;
  stockId: number;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  reason?: string;
  ai?: boolean;
  horizon?: string;
  strategy_tag?: string;
  market_regime?: string;
  ai_provider?: string;
  ai_model?: string;
  ai_upstream_model?: string;
  ai_latency_ms?: number;
}

/** Atomically execute a paper trade and update the position & cash. */
export function executeTrade(opts: ExecuteOpts) {
  const tx = db.transaction(() => {
    const acc = db.prepare('SELECT * FROM paper_accounts WHERE id = ?').get(opts.accountId) as PaperAccount | undefined;
    if (!acc) throw new Error('Account not found');
    const gross = opts.price * opts.quantity;
    const charges = calculateCharges(opts.side, gross);
    const fees = charges.totalCharges;
    const net = opts.side === 'BUY' ? gross + fees : gross - fees;
    let realizedPnl: number | null = null;

    if (opts.side === 'BUY') {
      if (net > acc.cash) throw new Error(`Insufficient cash: need ₹${net.toFixed(2)}, have ₹${acc.cash.toFixed(2)}`);
      const pos = db
        .prepare('SELECT * FROM paper_positions WHERE account_id = ? AND stock_id = ?')
        .get(opts.accountId, opts.stockId) as { id: number; quantity: number; average_price: number } | undefined;
      const newQty = (pos?.quantity ?? 0) + opts.quantity;
      const newAvg = pos
        ? (pos.average_price * pos.quantity + opts.price * opts.quantity) / newQty
        : opts.price;
      if (pos) {
        db.prepare(
          'UPDATE paper_positions SET quantity = ?, average_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ).run(newQty, newAvg, pos.id);
      } else {
        db.prepare(
          'INSERT INTO paper_positions (account_id, stock_id, quantity, average_price) VALUES (?, ?, ?, ?)',
        ).run(opts.accountId, opts.stockId, newQty, newAvg);
      }
      db.prepare('UPDATE paper_accounts SET cash = cash - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        net,
        opts.accountId,
      );
    } else {
      const pos = db
        .prepare('SELECT * FROM paper_positions WHERE account_id = ? AND stock_id = ?')
        .get(opts.accountId, opts.stockId) as { id: number; quantity: number; average_price: number } | undefined;
      if (!pos || pos.quantity < opts.quantity) throw new Error('Not enough quantity to sell');
      // Realised P&L = (sell price - avg cost) * qty - buy+sell charges
      const buyCharges = calculateCharges('BUY', pos.average_price * opts.quantity).totalCharges;
      realizedPnl = (opts.price - pos.average_price) * opts.quantity - fees - buyCharges;
      const remaining = pos.quantity - opts.quantity;
      if (remaining === 0) {
        db.prepare('DELETE FROM paper_positions WHERE id = ?').run(pos.id);
      } else {
        db.prepare(
          'UPDATE paper_positions SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ).run(remaining, pos.id);
      }
      db.prepare('UPDATE paper_accounts SET cash = cash + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
        net,
        opts.accountId,
      );
    }

    db.prepare(
      `INSERT INTO paper_trades (account_id, stock_id, side, quantity, price, gross, fees, net, reason, ai_decision, horizon, ai_provider, ai_model, ai_upstream_model, ai_latency_ms, strategy_tag, realized_pnl, market_regime)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      opts.accountId,
      opts.stockId,
      opts.side,
      opts.quantity,
      opts.price,
      gross,
      fees,
      net,
      opts.reason ?? null,
      opts.ai ? 1 : 0,
      opts.horizon ?? null,
      opts.ai_provider ?? null,
      opts.ai_model ?? null,
      opts.ai_upstream_model ?? null,
      opts.ai_latency_ms ?? null,
      opts.strategy_tag ?? null,
      realizedPnl,
      opts.market_regime ?? null,
    );
  });
  tx();
}

/**
 * Detect market regime from recent prices of the universe symbols.
 * Returns 'Bullish' | 'Bearish' | 'Sideways' based on the median 20-bar return
 * across the candidate universe (or fallback if insufficient data).
 */
export function detectMarketRegime(symbols: string[]): {
  regime: 'Bullish' | 'Bearish' | 'Sideways';
  medianReturnPct: number;
  breadth: { up: number; down: number; flat: number };
} {
  const rows = symbols.length
    ? (db
        .prepare(
          `SELECT s.symbol,
                  (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY id DESC LIMIT 1) AS last,
                  (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY id DESC LIMIT 1 OFFSET 19) AS prev
           FROM stocks s WHERE s.symbol IN (${symbols.map(() => '?').join(',')})`,
        )
        .all(...symbols) as Array<{ symbol: string; last: number | null; prev: number | null }>)
    : [];
  const rets: number[] = [];
  let up = 0, down = 0, flat = 0;
  for (const r of rows) {
    if (r.last && r.prev && r.prev > 0) {
      const pct = ((r.last - r.prev) / r.prev) * 100;
      rets.push(pct);
      if (pct > 1) up++;
      else if (pct < -1) down++;
      else flat++;
    }
  }
  rets.sort((a, b) => a - b);
  const median = rets.length ? rets[Math.floor(rets.length / 2)] : 0;
  let regime: 'Bullish' | 'Bearish' | 'Sideways' = 'Sideways';
  if (median > 1.5 && up > down) regime = 'Bullish';
  else if (median < -1.5 && down > up) regime = 'Bearish';
  return { regime, medianReturnPct: median, breadth: { up, down, flat } };
}

/**
 * Phase 5: Turbulence Index — measures how unusual current market conditions are.
 * Based on Mahalanobis-distance-inspired approach from FinRL.
 * Compares recent daily returns variance to historical norm.
 * Returns a multiplier: 1.0 = normal, <1.0 = reduce position sizes.
 */
export function computeTurbulence(symbols: string[]): {
  turbulence: number; // raw score (higher = more turbulent)
  level: 'Normal' | 'Elevated' | 'Extreme';
  positionMultiplier: number; // 1.0, 0.5, or 0 (no new buys)
} {
  if (symbols.length < 3) return { turbulence: 0, level: 'Normal', positionMultiplier: 1.0 };

  // Get recent 5-day returns and historical 60-day volatility
  const rows = db.prepare(
    `SELECT s.symbol,
            (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY id DESC LIMIT 1) AS p0,
            (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY id DESC LIMIT 1 OFFSET 4) AS p5,
            (SELECT price FROM stock_prices WHERE stock_id = s.id ORDER BY id DESC LIMIT 1 OFFSET 59) AS p60
     FROM stocks s WHERE s.symbol IN (${symbols.map(() => '?').join(',')})`,
  ).all(...symbols) as Array<{ symbol: string; p0: number | null; p5: number | null; p60: number | null }>;

  const recentRets: number[] = [];
  const longRets: number[] = [];

  for (const r of rows) {
    if (r.p0 && r.p5 && r.p5 > 0) {
      recentRets.push(Math.abs(((r.p0 - r.p5) / r.p5) * 100));
    }
    if (r.p0 && r.p60 && r.p60 > 0) {
      const dailyRet = Math.abs(((r.p0 - r.p60) / r.p60) * 100) / 60;
      longRets.push(dailyRet);
    }
  }

  if (recentRets.length < 3) return { turbulence: 0, level: 'Normal', positionMultiplier: 1.0 };

  // Turbulence = ratio of recent absolute moves to historical norm
  const recentAvg = recentRets.reduce((s, v) => s + v, 0) / recentRets.length;
  const historicalAvg = longRets.length > 0
    ? longRets.reduce((s, v) => s + v, 0) / longRets.length
    : 1;
  const turbulence = historicalAvg > 0 ? recentAvg / (historicalAvg * 5) : 1;

  // Thresholds based on empirical observations
  let level: 'Normal' | 'Elevated' | 'Extreme' = 'Normal';
  let positionMultiplier = 1.0;

  if (turbulence > 3.0) {
    level = 'Extreme';
    positionMultiplier = 0; // no new buys
  } else if (turbulence > 1.8) {
    level = 'Elevated';
    positionMultiplier = 0.5; // halve position sizes
  }

  return { turbulence, level, positionMultiplier };
}

/**
 * Aggregate realised-PnL per (strategy_tag, horizon) bucket so the UI can
 * surface which playbooks are winning. Used as a feedback signal back into
 * the next AI prompt as well.
 */
export function getStrategyStats(accountId: number) {
  const rows = db
    .prepare(
      `SELECT COALESCE(strategy_tag, 'unknown') AS strategy_tag,
              COALESCE(horizon, 'unspecified') AS horizon,
              COUNT(*) AS trades,
              SUM(CASE WHEN realized_pnl > 0 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN realized_pnl < 0 THEN 1 ELSE 0 END) AS losses,
              ROUND(AVG(realized_pnl), 2) AS avg_pnl,
              ROUND(SUM(realized_pnl), 2) AS total_pnl
       FROM paper_trades
       WHERE account_id = ? AND side = 'SELL' AND realized_pnl IS NOT NULL
       GROUP BY strategy_tag, horizon
       ORDER BY total_pnl DESC`,
    )
    .all(accountId) as Array<{ strategy_tag: string; horizon: string; trades: number; wins: number; losses: number; avg_pnl: number; total_pnl: number }>;
  return rows.map((r) => ({
    ...r,
    win_rate_pct: r.trades ? Math.round((r.wins / r.trades) * 100) : 0,
  }));
}

export async function recomputeEquity(accountId: number) {
  const acc = db.prepare('SELECT * FROM paper_accounts WHERE id = ?').get(accountId) as PaperAccount;
  const positions = getPositions(accountId);

  // If no open positions, only sample once per hour to avoid flooding the
  // equity_curve table with identical cash-only rows.
  if (positions.length === 0) {
    const last = db
      .prepare(
        'SELECT timestamp FROM paper_equity_curve WHERE account_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(accountId) as { timestamp: string } | undefined;
    if (last) {
      const minutesSince = (Date.now() - new Date(last.timestamp).getTime()) / 60_000;
      if (minutesSince < 60) return { cash: acc.cash, equity: 0, total: acc.cash };
    }
    db.prepare(
      'INSERT INTO paper_equity_curve (account_id, cash, equity, total) VALUES (?, ?, ?, ?)',
    ).run(accountId, acc.cash, 0, acc.cash);
    return { cash: acc.cash, equity: 0, total: acc.cash };
  }

  let equity = 0;
  for (const p of positions) {
    const q = await fetchYahooQuote(p.symbol, p.exchange);
    if (q) equity += p.quantity * q.price;
    else equity += p.quantity * p.average_price;
  }
  const total = acc.cash + equity;
  db.prepare(
    `INSERT INTO paper_equity_curve (account_id, cash, equity, total) VALUES (?, ?, ?, ?)`,
  ).run(accountId, acc.cash, equity, total);
  return { cash: acc.cash, equity, total };
}

interface AIAction {
  symbol: string;
  side: 'BUY' | 'SELL' | 'HOLD';
  quantity: number;
  reason: string;
  horizon?: 'Intraday' | 'Short-term' | 'Long-term'; // Intraday will be rejected at execution
  conviction?: number;
  strategy_tag?: string;
}

/** How recently the AI bought the same symbol counts as "fixation". */
const FIXATION_WINDOW_MIN = 120; // Increased from 60 to reduce churning
const FIXATION_MAX_BUYS_IN_WINDOW = 1;

/** One full AI decision cycle for the user's playground. Returns trades executed.
 * `manual` = invoked via the "Run AI Cycle" button → bypass the auto_trade gate
 * (the user explicitly asked for a cycle) but still respect market-hours + kill-switch.
 */
export async function runAITraderCycle(
  userId: number,
  opts: { manual?: boolean } = {},
): Promise<{
  decisions: AIAction[];
  executed: number;
  errors: string[];
  forced_closes?: Array<{ symbol: string; reason: string }>;
  paused?: boolean;
  skipped?: 'auto_off' | 'market_closed' | 'paused';
  ai?: { provider: string; model: string; upstream_model?: string; ms?: number };
  daily_dd_pct?: number;
}> {
  const acc = getOrCreateAccount(userId);
  if (!opts.manual && !acc.auto_trade) {
    logger.info({ userId }, 'AI trader: skipped (auto_trade OFF)');
    return { decisions: [], executed: 0, errors: ['auto_trade is OFF'], skipped: 'auto_off' };
  }
  if (!opts.manual && !isNseOpen()) {
    logger.info({ userId }, 'AI trader: skipped (NSE closed)');
    return { decisions: [], executed: 0, errors: ['NSE is closed (Mon-Fri 09:15–15:30 IST)'], skipped: 'market_closed' };
  }
  if (acc.paused_until && new Date(acc.paused_until) > new Date()) {
    return { decisions: [], executed: 0, errors: [`AI paused until ${acc.paused_until} (kill-switch)`], paused: true, skipped: 'paused' };
  }

  // ── Daily kill-switch: compare today's total to yesterday's last close (IST boundary) ──
  const yest = db.prepare(
    `SELECT total FROM paper_equity_curve
     WHERE account_id = ?
       AND DATE(timestamp, '+05:30') < DATE('now', '+05:30')
     ORDER BY id DESC LIMIT 1`,
  ).get(acc.id) as { total: number } | undefined;
  let positions = getPositions(acc.id);
  let positionsBySymbol = new Map(positions.map((p) => [p.symbol, p]));
  // compute current total
  let curEquity = 0;
  const ltps = new Map<string, number>();
  for (const p of positions) {
    const q = await fetchYahooQuote(p.symbol, p.exchange);
    const price = q?.price ?? p.average_price;
    ltps.set(p.symbol, price);
    curEquity += p.quantity * price;
  }
  const curTotal = acc.cash + curEquity;
  let dailyDdPct: number | undefined;
  if (yest && yest.total > 0) {
    dailyDdPct = ((curTotal - yest.total) / yest.total) * 100;
    if (dailyDdPct <= -acc.max_daily_loss_pct) {
      const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
      db.prepare('UPDATE paper_accounts SET paused_until = ? WHERE id = ?').run(tomorrow.toISOString(), acc.id);
      logger.warn({ userId, dd: dailyDdPct }, 'AI trader: daily kill-switch triggered');
      return { decisions: [], executed: 0, errors: [`Daily kill-switch hit: ${dailyDdPct.toFixed(2)}% loss`], paused: true, daily_dd_pct: dailyDdPct };
    }
  }

  // ── FP-1.20.1: 5-day rolling drawdown circuit breaker ────────────────
  // Different from the daily kill-switch above: this looks at the rolling
  // 5-day peak so a slow grind down isn't masked by per-day jitter.
  const rolling = computeRollingDrawdown(acc.id, 5);
  let rollingDdMode: 'normal' | 'reduce' | 'block' = 'normal';
  if (rolling.ddPct <= -12) {
    rollingDdMode = 'block';
    logger.warn({ accountId: acc.id, ddPct: rolling.ddPct, peak: rolling.peak }, 'Rolling drawdown >=12% — blocking all new BUYs');
  } else if (rolling.ddPct <= -8) {
    rollingDdMode = 'reduce';
    logger.info({ accountId: acc.id, ddPct: rolling.ddPct }, 'Rolling drawdown >=8% — halving position sizes');
  }

  // ── FP-1.20.1: Intraday force-close at 3:25 PM IST ──
  // Any open position tagged "intraday" must be flat by end-of-session.
  // This protects against overnight gap risk on what was meant to be a
  // same-day trade.
  {
    const istMs = Date.now() + 5.5 * 3600 * 1000;
    const ist = new Date(istMs);
    const t = ist.getUTCHours() * 100 + ist.getUTCMinutes();
    if (t >= 1525 && t <= 1559) {
      const intradayOpen = db.prepare(
        `SELECT p.*, s.symbol FROM paper_positions p
           JOIN paper_trades t ON t.account_id = p.account_id AND t.stock_id = p.stock_id AND t.side = 'BUY'
           JOIN stocks s ON s.id = p.stock_id
          WHERE p.account_id = ? AND p.quantity > 0 AND t.horizon = 'Intraday'
          GROUP BY p.id`,
      ).all(acc.id) as Array<{ stock_id: number; symbol: string; quantity: number; average_price: number }>;
      for (const p of intradayOpen) {
        const q = await fetchYahooQuote(p.symbol, 'NSE');
        const ltp = q?.price ?? p.average_price;
        try {
          executeTrade({
            accountId: acc.id,
            stockId: p.stock_id,
            side: 'SELL',
            quantity: p.quantity,
            price: ltp,
            reason: 'Intraday force-close at 3:25 PM IST',
            ai: true,
            strategy_tag: 'risk:intraday-eod',
            market_regime: 'EOD',
          });
        } catch {}
      }
    }
  }

  // ── Stop-loss / trailing-stop / take-profit pre-pass ──
  // NOTE: regimeInfo is refined below once per-symbol live contexts are built —
  // detectMarketRegime reads the stock_prices table which is empty on a cold
  // start, so on its own it always returns "Sideways" (the most conservative,
  // HOLD-biased playbook). See the breadth-based refinement after ctxs.
  let regimeInfo = detectMarketRegime(positions.map((p) => p.symbol).slice(0, 12));
  const forced: Array<{ symbol: string; reason: string }> = [];
  for (const p of positions) {
    const ltp = ltps.get(p.symbol) ?? p.average_price;
    const pnlPct = ((ltp - p.average_price) / p.average_price) * 100;

    // Trailing stop: check if position has moved up significantly and is now pulling back
    // Look at peak price since entry from recent quotes
    const peakRow = db.prepare(
      `SELECT MAX(price) as peak FROM paper_trades
       WHERE account_id = ? AND stock_id = ? AND side = 'BUY'
       ORDER BY id DESC LIMIT 1`,
    ).get(acc.id, p.stock_id) as { peak: number } | undefined;
    const entryPeak = Math.max(p.average_price, peakRow?.peak ?? p.average_price, ltp);

    // If position was up >5% at peak but is now trailing back, use trailing stop
    const peakGain = ((entryPeak - p.average_price) / p.average_price) * 100;
    const drawdownFromPeak = ((entryPeak - ltp) / entryPeak) * 100;

    // FP-1.20.1: tiered trailing-stop give-back replaces the fixed 4% trail.
    // Tighter trail as profits grow so big winners aren't given back.
    const tieredGB = tieredTrailGiveback(peakGain);
    if (tieredGB !== null && drawdownFromPeak >= tieredGB) {
      // Trailing stop triggered — lock in some profit
      try {
        executeTrade({ accountId: acc.id, stockId: p.stock_id, side: 'SELL', quantity: p.quantity, price: ltp, reason: `Trailing stop (tier @ ${tieredGB.toFixed(1)}%): was +${peakGain.toFixed(1)}%, pullback ${drawdownFromPeak.toFixed(1)}% from peak`, ai: true, strategy_tag: 'risk:trailing-stop', market_regime: regimeInfo.regime });
        forced.push({ symbol: p.symbol, reason: `Trailing stop (peak +${peakGain.toFixed(1)}%, now +${pnlPct.toFixed(1)}%)` });
      } catch {}
    } else if (pnlPct <= -acc.stop_loss_pct) {
      // Hard stop-loss
      try {
        executeTrade({ accountId: acc.id, stockId: p.stock_id, side: 'SELL', quantity: p.quantity, price: ltp, reason: `Stop-loss ${pnlPct.toFixed(2)}%`, ai: true, strategy_tag: 'risk:stop-loss', market_regime: regimeInfo.regime });
        forced.push({ symbol: p.symbol, reason: `Stop-loss ${pnlPct.toFixed(2)}%` });
      } catch {}
    } else if (pnlPct >= acc.take_profit_pct) {
      // Take profit — sell 50% to lock in gains, let rest ride with trailing stop
      const sellQty = Math.max(1, Math.floor(p.quantity / 2));
      try {
        executeTrade({ accountId: acc.id, stockId: p.stock_id, side: 'SELL', quantity: sellQty, price: ltp, reason: `Partial take-profit ${pnlPct.toFixed(2)}% (50% position)`, ai: true, strategy_tag: 'risk:take-profit', market_regime: regimeInfo.regime });
        forced.push({ symbol: p.symbol, reason: `Partial take-profit ${pnlPct.toFixed(2)}%` });
      } catch {}
    }
  }
  // refresh positions after forced closes
  if (forced.length) {
    positions = getPositions(acc.id);
    positionsBySymbol = new Map(positions.map((p) => [p.symbol, p]));
  }
  const accAfter = db.prepare('SELECT * FROM paper_accounts WHERE id = ?').get(acc.id) as PaperAccount;

  let universe: string[] = [];
  try {
    if (accAfter.universe) universe = JSON.parse(accAfter.universe);
  } catch {}
  // Auto-mode: empty universe → pull dynamic top picks from Discovery + the
  // user's watchlist. Falls back to default universe if Discovery hasn't run.
  let universeMode: 'custom' | 'auto' = 'custom';
  if (!universe || universe.length === 0) {
    universeMode = 'auto';
    // FP-1.20.1: stratified 50-symbol auto-universe so the AI has real
    // cross-cap optionality every cycle rather than churning the same 10
    // blue-chips. Composition (best-effort, dedup'd, cap = 50):
    //   * 20 highest-scoring BUY picks from Discovery (all tiers)
    //   * user watchlist symbols + currently-held positions (always in)
    //   * 8 large + 8 mid + 6 small + 4 micro + 2 penny (random per cycle)
    //   * 4 ETFs (for hedge / diversification)
    //   * 6 fresh symbols from sectors NOT yet covered above
    const buys = topBuyPicks(20);
    const watch = (db
      .prepare(
        `SELECT s.symbol FROM watchlist w JOIN stocks s ON w.stock_id = s.id WHERE w.user_id = ?`,
      )
      .all(userId) as { symbol: string }[]).map((r) => r.symbol);
    const held = positions.map((p) => p.symbol);

    const sampleByTier = (tier: string, n: number): string[] =>
      (db
        .prepare(
          `SELECT symbol FROM stocks WHERE tier = ? ORDER BY RANDOM() LIMIT ?`,
        )
        .all(tier, n) as { symbol: string }[]).map((r) => r.symbol);

    const tiered = [
      ...sampleByTier('large', 8),
      ...sampleByTier('mid', 8),
      ...sampleByTier('small', 6),
      ...sampleByTier('micro', 4),
      ...sampleByTier('penny', 2),
      ...sampleByTier('etf', 4),
    ];

    // Fresh symbols from under-covered sectors.
    const covered = new Set([...buys, ...watch, ...held, ...tiered]);
    const coveredSectors = new Set(
      (db.prepare(
        `SELECT DISTINCT sector FROM stocks WHERE symbol IN (${[...covered].map(() => '?').join(',') || "''"})`,
      ).all(...[...covered]) as { sector: string }[]).map((r) => r.sector),
    );
    const freshSectors = (db
      .prepare(
        `SELECT s.symbol FROM stocks s WHERE s.sector NOT IN (${[...coveredSectors].map(() => '?').join(',') || "''"}) ORDER BY RANDOM() LIMIT 6`,
      )
      .all(...[...coveredSectors]) as { symbol: string }[]).map((r) => r.symbol);

    const merged = [...new Set([...held, ...watch, ...buys, ...tiered, ...freshSectors])];
    universe = merged.length > 0 ? merged.slice(0, 50) : DEFAULT_UNIVERSE;
  }

  // ── Anti-fixation: figure out which symbols the AI has already bought recently ──
  const recentBuyCounts = new Map<string, number>(
    (db.prepare(
      `SELECT s.symbol, COUNT(*) c FROM paper_trades t JOIN stocks s ON t.stock_id = s.id
       WHERE t.account_id = ?
         AND t.ai_decision = 1 AND t.side = 'BUY'
         AND datetime(t.executed_at) >= datetime('now', ?)
       GROUP BY s.symbol`,
    ).all(acc.id, `-${FIXATION_WINDOW_MIN} minutes`) as { symbol: string; c: number }[])
      .map((r) => [r.symbol, r.c]),
  );

  // Compact opportunity hints from the latest discovery scan (cheap, no AI calls)
  const opportunities = listOpportunities(30, 'BUY')
    .filter((o: any) => universe.includes(o.symbol))
    .map((o: any) => ({
      symbol: o.symbol,
      tier: o.tier,
      score: o.score,
      horizon: o.horizon,
      expected_upside_pct: o.expected_upside_pct,
      risk_level: o.risk_level,
      rationale: String(o.rationale ?? '').slice(0, 200),
    }));

  // Compact context per symbol (technicals + 30d candles + per-symbol news headlines)
  const ctxs: Record<string, any> = {};
  // FP-1.20.1: ctxSymbols expanded 12 -> 30 to match larger universe.
  let ctxSymbols = universe.slice(0, 30);
  await Promise.all(
    ctxSymbols.map(async (sym) => {
      try { ctxs[sym] = await buildContext(sym, 'NSE'); } catch {}
    }),
  );

  // FP: prune symbols Yahoo couldn't price. Several seeded NSE tickers are
  // stale/renamed (e.g. AMARAJABAT → ARE&M, TATATELE → TTML) and return 404, so
  // their context is empty. Feeding empty contexts to the AI just dilutes its
  // focus and biases it toward HOLD-everything. We keep currently-held symbols
  // in the universe regardless so the AI can still decide to SELL them.
  {
    const heldSymbols = new Set(positions.map((p) => p.symbol));
    const validCtxSymbols = ctxSymbols.filter((s) => heldSymbols.has(s) || ctxs[s]?.quote != null);
    // Only narrow if we still have a workable set — otherwise (e.g. Yahoo fully
    // down) fall back to the original universe rather than starving the AI.
    if (validCtxSymbols.length >= 5) {
      for (const s of ctxSymbols) {
        if (!heldSymbols.has(s) && ctxs[s]?.quote == null) delete ctxs[s];
      }
      ctxSymbols = [...new Set([...heldSymbols, ...validCtxSymbols])];
      universe = [...new Set([...heldSymbols, ...validCtxSymbols, ...universe.filter((s) => heldSymbols.has(s) || ctxs[s]?.quote != null)])];
    }
  }

  // ── Cold-start regime refinement ──────────────────────────────────────────
  // detectMarketRegime() reads the (initially empty) stock_prices table, so a
  // fresh deployment is stuck reporting "Sideways" and the AI is fed the most
  // conservative playbook → it never buys → never builds positions → never
  // leaves Sideways. Break that trap by deriving a coarse regime from the LIVE
  // Yahoo technicals already in ctxs (close vs 20-SMA breadth + average 1-day
  // change). Once the new price-snapshot cron has accumulated history, the
  // stock_prices-based regime takes over naturally.
  if (regimeInfo.breadth.up + regimeInfo.breadth.down + regimeInfo.breadth.flat < 5) {
    let up = 0, down = 0, flat = 0;
    const changes: number[] = [];
    for (const c of Object.values(ctxs) as any[]) {
      const e = c?.enhanced;
      if (!e || e.close == null || e.sma20 == null) continue;
      const ch = Number(e.priceChange1d ?? 0);
      changes.push(ch);
      if (e.close > e.sma20 * 1.005) up++;
      else if (e.close < e.sma20 * 0.995) down++;
      else flat++;
    }
    const sampled = up + down + flat;
    if (sampled >= 5) {
      const avgChange = changes.reduce((s, v) => s + v, 0) / (changes.length || 1);
      let regime: 'Bullish' | 'Bearish' | 'Sideways' = 'Sideways';
      if (up / sampled >= 0.55 && up > down) regime = 'Bullish';
      else if (down / sampled >= 0.55 && down > up) regime = 'Bearish';
      regimeInfo = { regime, medianReturnPct: avgChange, breadth: { up, down, flat } };
      logger.info({ regime, up, down, flat, avgChange: avgChange.toFixed(2) }, 'AI trader: regime derived from live technicals (cold-start)');
    }
  }

  // Recent prediction outputs for these symbols (boost AI's situational awareness)
  const recentPredictions = (db.prepare(
    `SELECT s.symbol, p.strategy, p.horizon, p.direction, p.expected_move_p, p.target_price, p.confidence, p.status, p.created_at
     FROM predictions p JOIN stocks s ON p.stock_id = s.id
     WHERE p.user_id = ? AND s.symbol IN (${ctxSymbols.map(() => '?').join(',') || "''"})
     ORDER BY p.id DESC LIMIT 30`,
  ).all(userId, ...ctxSymbols) as any[]);

  // Broad market headlines (sector / macro)
  let macroNews: Array<{ headline: string; source: string; at?: string }> = [];
  try {
    macroNews = (await fetchMarketNews([])).slice(0, 8).map((n: any) => ({
      headline: n.headline, source: n.source, at: n.publishedAt,
    }));
  } catch {}

  // ── Phase 1: Aggregate sentiment signals ──
  const symbolSentiments: Record<string, any> = {};
  for (const sym of ctxSymbols) {
    const s = getSymbolSentiment(sym, 7);
    if (s) symbolSentiments[sym] = { score: s.avgScore.toFixed(2), trend: s.trend, articles: s.count };
  }
  const broadSentiment = getMarketSentiment(3);

  // Sector mix of the symbols the AI is reasoning about
  const sectorMix = (db.prepare(
    `SELECT sector, COUNT(*) c FROM stocks WHERE symbol IN (${ctxSymbols.map(() => '?').join(',') || "''"})
     GROUP BY sector ORDER BY c DESC`,
  ).all(...ctxSymbols) as { sector: string; c: number }[]);

  const aiCfg = resolveAIConfig(userId);
  const totalEquityHint = accAfter.cash + curEquity;
  const maxPosNotional = totalEquityHint * (accAfter.max_position_pct / 100);
  const blockedFromBuy = [...recentBuyCounts.entries()]
    .filter(([, c]) => c >= FIXATION_MAX_BUYS_IN_WINDOW)
    .map(([s]) => s);
  // Closed-loop feedback: which strategies have actually made money on this account?
  const strategyStats = getStrategyStats(acc.id).slice(0, 12);
  // Regime-aware playbook hint — tells the AI which class of strategy fits today's tape.
  const regimePlaybook =
    regimeInfo.regime === 'Bullish'
      ? 'Favor breakout / momentum / trend-following entries; trail stops, ride winners. Only buy stocks above their 20-day SMA with RSI between 40-70 (not overbought).'
      : regimeInfo.regime === 'Bearish'
      ? 'Capital preservation is priority. Raise cash aggressively. Only high-conviction longs in defensive sectors with strong support levels. Keep at least 50% in cash.'
      : 'Favor mean-reversion entries at Bollinger lower band / strong support. Smaller position sizes. Avoid chasing. Wait for RSI < 35 on quality stocks.';

  // Calculate break-even threshold for a typical trade at this equity level
  const typicalTradeSize = totalEquityHint * 0.10; // 10% position
  const typicalQty = Math.max(1, Math.floor(typicalTradeSize / 1500)); // assume ~₹1500 avg stock price
  const breakEvenPct = minimumBreakevenPct(1500, typicalQty);

  const system = `You are a DISCIPLINED, PATIENT AI portfolio manager for an Indian-markets paper-trading account that will eventually become a real trading account.

CRITICAL OBJECTIVE: Generate CONSISTENT PROFITS after accounting for all real charges (STT, brokerage, GST, stamp duty) and 15% short-term capital gains tax. Every trade must have a CLEAR edge.

Strategy: ${accAfter.strategy}. Risk: ${accAfter.risk_level}. Universe mode: ${universeMode}.
Market regime: ${regimeInfo.regime} (median 20-bar return ${regimeInfo.medianReturnPct.toFixed(2)}%, breadth up=${regimeInfo.breadth.up}/down=${regimeInfo.breadth.down}/flat=${regimeInfo.breadth.flat}).
Playbook: ${regimePlaybook}

COST AWARENESS (per trade, approximate):
- Round-trip charges: ~0.25-0.35% (STT 0.1%, brokerage ₹20, GST, stamp duty)
- Short-term capital gains tax: 15% on profits
- Minimum price move needed to break even: ~${breakEvenPct.toFixed(2)}%
- Therefore: ONLY take trades where you expect AT LEAST ${(breakEvenPct * MIN_REWARD_RISK_RATIO).toFixed(1)}% upside (${MIN_REWARD_RISK_RATIO}:1 reward-to-risk after costs)

DISCIPLINE RULES (NON-NEGOTIABLE):
1. QUALITY > QUANTITY: Maximum ${MAX_BUYS_PER_CYCLE} BUY decisions per cycle. It is PERFECTLY FINE to return zero decisions if no compelling setup exists.
2. CONVICTION THRESHOLD: Only BUY with conviction ≥ ${MIN_CONVICTION_BUY}. If unsure, HOLD. Patience pays.
3. MINIMUM EXPECTED RETURN: Each BUY must target at least ${(breakEvenPct * 3).toFixed(1)}% gain (3x break-even) to justify the trade.
4. ENTRY CRITERIA — ALL must be true for a BUY:
   a) Stock is in an uptrend (above 20-SMA) OR at strong support with reversal signal
   b) RSI is NOT overbought (RSI < 70) — do NOT chase rallies
   c) Volume confirms the move (above average or increasing)
   d) News/sentiment supports the direction (no negative surprises)
   e) Risk/reward ratio is favorable: stop-loss distance < expected gain / 2
5. EXIT CRITERIA for SELL:
   a) Thesis is broken (stock dropped below key support)
   b) Better opportunity exists (rotate capital)
   c) Target achieved
   d) Negative news that changes fundamentals
6. POSITION SIZING: Riskier setups get smaller positions. High-conviction with multiple confirming signals → larger.
7. SECTOR DIVERSIFICATION: No more than 30% of portfolio in one sector.
8. HOLD BIAS: When in doubt, HOLD. Transaction costs eat profits. Do NOT churn.
9. HORIZON DISCIPLINE — pick the right one for the setup:
   * Intraday — same-day entry/exit. ALLOWED only when:
       - stock tier is large or mid (liquid),
       - clear catalyst within the next 1-3 hours,
       - tight 1-2% stop, tight 1.5-3% target,
       - position MUST be closed by 3:25 PM IST or the system will square it off automatically.
   * Short-term — days to weeks. RSI/MACD/breakout/news catalyst plays.
   * Long-term — months. Fundamentals, sector tailwind, dividend, multi-quarter thesis.
10. RISK MANAGEMENT: Every BUY must specify where the stop-loss should be (in the reason field).

Hard constraints:
- Only operate within these symbols: ${universe.join(', ')}.
- BUY only with available cash ₹${accAfter.cash.toFixed(2)}; never go negative.
- SELL only what is currently held.
- Position-size cap ₹${maxPosNotional.toFixed(0)} per single stock (max ${accAfter.max_position_pct}% of total equity).
- DO NOT BUY any of these symbols this cycle (recently bought, anti-fixation): ${blockedFromBuy.length ? blockedFromBuy.join(', ') : 'none'}.
- Each BUY must include horizon: "Intraday", "Short-term", or "Long-term" (Intraday only on liquid large/mid names).
- Each decision must tag a strategy_tag: momentum, mean-reversion, breakout, value, swing, defensive, news-driven.
- LEARN FROM HISTORY: Review the past strategy P&L below. AVOID strategies that have lost money. FAVOR strategies that have been profitable.

Respond ONLY as JSON: { "decisions": [ { "symbol": string, "side": "BUY"|"SELL"|"HOLD", "quantity": number, "reason": string (include stop-loss level and target price), "horizon": "Intraday"|"Short-term"|"Long-term", "strategy_tag": string, "conviction": number /* 0..1, BUY needs ≥${MIN_CONVICTION_BUY} */ } ] }
If no good setups exist, return: { "decisions": [] }`;

  const prompt = `Cash: ₹${accAfter.cash.toFixed(2)}
Total equity (cash+positions): ₹${totalEquityHint.toFixed(2)}
Max single-position notional: ₹${maxPosNotional.toFixed(0)}
Daily drawdown so far: ${dailyDdPct == null ? 'n/a (no prior session)' : dailyDdPct.toFixed(2) + '%'} (kill-switch at -${accAfter.max_daily_loss_pct}%)

Current positions: ${JSON.stringify(positions.map((p) => ({
    symbol: p.symbol,
    qty: p.quantity,
    avg: p.average_price,
    ltp: ltps.get(p.symbol),
    pnl_pct: (((ltps.get(p.symbol) ?? p.average_price) - p.average_price) / p.average_price) * 100,
    weight_pct: ((p.quantity * (ltps.get(p.symbol) ?? p.average_price)) / totalEquityHint) * 100,
  })))}

Forced-closes already executed this cycle: ${JSON.stringify(forced)}
Recent BUY counts (last ${FIXATION_WINDOW_MIN} min): ${JSON.stringify([...recentBuyCounts.entries()])}
Sector mix of candidate symbols: ${JSON.stringify(sectorMix)}
Discovery opportunities (latest scan, BUY-only): ${JSON.stringify(opportunities)}
Recent predictions for these symbols: ${JSON.stringify(recentPredictions).slice(0, 4_000)}
Macro/market headlines: ${JSON.stringify(macroNews)}
FinBERT sentiment per symbol (7-day avg, -1=bearish to +1=bullish): ${JSON.stringify(symbolSentiments)}
Broad market sentiment (3-day): score=${broadSentiment.avgScore.toFixed(2)}, articles=${broadSentiment.count}, bullish=${broadSentiment.bullish}
Past strategy P&L on this account (closed trades): ${JSON.stringify(strategyStats)}

Per-symbol market context (technicals + last 30 candles + per-symbol news):
${JSON.stringify(ctxs).slice(0, 12_000)}`;

  // Robustly pull a { decisions: [...] } object out of an AI response that may
  // be wrapped in prose or code fences. Mirrors the recovery used in
  // predictions.ts / discovery.ts.
  const parseDecisions = (text: string): AIAction[] | null => {
    if (!text || !text.trim()) return null;
    const tryParse = (s: string): AIAction[] | null => {
      try {
        const j = JSON.parse(s);
        if (j && Array.isArray(j.decisions)) return j.decisions as AIAction[];
      } catch { /* fall through */ }
      return null;
    };
    return tryParse(text.trim()) ?? (() => {
      const m = /\{[\s\S]*\}/.exec(text);
      return m ? tryParse(m[0]) : null;
    })();
  };

  // The trade decision is the most important AI call in the system, so we steer
  // Arbiter's auto-router toward strict-JSON, instruction-following providers and
  // away from the ones empirically observed to return empty/truncated bodies or
  // pure coding models (cloudflare gpt-oss → 0 chars, ollama qwen3-coder → empty,
  // pollinations → truncated JSON). If the first parse still fails we retry once
  // with temperature 0 and a different preferred provider before giving up.
  let decisions: AIAction[] = [];
  let aiMeta: AICallRecord | null = null;
  const traderCallOpts = {
    prompt,
    systemPrompt: system,
    json: true as const,
    temperature: 0.3,
    timeoutMs: 60_000,
    callerTag: 'paper-trader' as const,
    preferProvider: 'cerebras',
    avoidProviders: ['pollinations', 'cloudflare', 'ollama', 'huggingface'],
  };
  try {
    const r = await aiCompleteMeta(aiCfg, traderCallOpts);
    aiMeta = r.meta;
    let parsed = parseDecisions(r.text);
    if (parsed === null) {
      logger.warn({ chars: r.text?.length ?? 0 }, 'AI trader cycle: unparseable response — retrying once (temp 0, prefer groq)');
      const r2 = await aiCompleteMeta(aiCfg, { ...traderCallOpts, temperature: 0, preferProvider: 'groq', timeoutMs: 75_000 });
      aiMeta = r2.meta;
      parsed = parseDecisions(r2.text);
    }
    if (parsed === null) throw new Error('AI returned no parseable { decisions } JSON after retry');
    decisions = parsed;
  } catch (e: any) {
    logger.warn({ err: e.message }, 'AI trader cycle: bad response');
    await recomputeEquity(acc.id);
    return { decisions: [], executed: 0, errors: [e.message], forced_closes: forced, daily_dd_pct: dailyDdPct };
  }

  // ── Phase 5: Turbulence Index — adjust position sizing in volatile markets ──
  const turbulence = computeTurbulence(universe.slice(0, 25));
  if (turbulence.level === 'Extreme') {
    logger.warn({ turbulence: turbulence.turbulence }, 'AI trader: EXTREME turbulence — blocking new buys');
  }

  // ── Phase 6: Get market-wide sentiment for ensemble ──
  const mktSentiment = getMarketSentiment(3);

  const errors: string[] = [];
  let executed = 0;
  let buysThisCycle = 0;
  const aiAttr = aiMeta
    ? { ai_provider: aiMeta.provider, ai_model: aiMeta.model, ai_upstream_model: aiMeta.upstreamModel, ai_latency_ms: aiMeta.ms }
    : {};

  // Sort decisions by conviction (highest first) so best trades get priority
  const sortedDecisions = [...decisions].sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));

  for (const d of sortedDecisions) {
    if (d.side === 'HOLD' || !d.quantity || d.quantity <= 0) continue;
    if (!universe.includes(d.symbol)) {
      errors.push(`Skipped ${d.symbol}: outside universe`);
      continue;
    }

    // ── CONVICTION FILTER ──
    const conviction = d.conviction ?? 0;
    if (d.side === 'BUY' && conviction < MIN_CONVICTION_BUY) {
      errors.push(`Skipped BUY ${d.symbol}: conviction ${conviction.toFixed(2)} < threshold ${MIN_CONVICTION_BUY}`);
      continue;
    }
    if (d.side === 'SELL' && conviction < MIN_CONVICTION_SELL) {
      errors.push(`Skipped SELL ${d.symbol}: conviction ${conviction.toFixed(2)} < threshold ${MIN_CONVICTION_SELL}`);
      continue;
    }

    // ── Phase 3: PROGRAMMATIC CONVICTION FLOOR (data-driven, not LLM-hallucinated) ──
    const symbolCtx = ctxs[d.symbol];
    const techStrength = symbolCtx?.enhanced?.technicalStrength ?? 50;
    const symSentiment = getSymbolSentiment(d.symbol, 7);
    const predAccuracy = getPredictionAccuracy(d.symbol);
    const volConfirm = symbolCtx?.enhanced?.volumeRatio20 != null && symbolCtx.enhanced.volumeRatio20 > 1.0
      && ((d.side === 'BUY' && (symbolCtx.enhanced.priceChange1d ?? 0) > 0) || (d.side === 'SELL' && (symbolCtx.enhanced.priceChange1d ?? 0) < 0));
    const trendAligned = symbolCtx?.enhanced
      ? (symbolCtx.enhanced.close > (symbolCtx.enhanced.sma20 ?? 0) && (symbolCtx.enhanced.macd?.histogram ?? 0) > 0)
      : false;

    const progConviction = computeConviction({
      technicalStrength: techStrength,
      sentimentScore: symSentiment?.avgScore ?? null,
      sentimentTrend: symSentiment?.trend ?? null,
      predictionAccuracy: predAccuracy,
      volumeConfirmation: volConfirm,
      trendAlignment: trendAligned,
      marketRegime: regimeInfo.regime,
      side: d.side,
    });

    // Phase 4: ENSEMBLE — compare LLM conviction vs programmatic conviction
    // If they disagree significantly, penalize
    const ensembleScore = (conviction + progConviction.score) / 2;
    const disagreement = Math.abs(conviction - progConviction.score);
    const ensemblePenalty = disagreement > 0.3 ? 0.15 : 0;
    const finalConviction = ensembleScore - ensemblePenalty;

    if (d.side === 'BUY' && progConviction.score < 0.40) {
      errors.push(`Skipped BUY ${d.symbol}: programmatic conviction ${progConviction.score.toFixed(2)} too low (${progConviction.reason})`);
      continue;
    }
    if (d.side === 'BUY' && finalConviction < 0.55) {
      errors.push(`Skipped BUY ${d.symbol}: ensemble conviction ${finalConviction.toFixed(2)} below 0.55 (LLM=${conviction.toFixed(2)}, prog=${progConviction.score.toFixed(2)}, disagreement=${disagreement.toFixed(2)})`);
      continue;
    }

    // ── FP-1.20.1: News-sentiment veto on BUY ──
    // If FinBERT 7-day average is firmly negative, only let through
    // exceptional-conviction BUYs (>=0.85). Prevents AI from catching falling knives.
    if (d.side === 'BUY' && symSentiment && symSentiment.avgScore <= -0.30 && conviction < 0.85) {
      errors.push(`Skipped BUY ${d.symbol}: negative news sentiment ${symSentiment.avgScore.toFixed(2)} requires conviction>=0.85 (got ${conviction.toFixed(2)})`);
      continue;
    }

    // ── FP-1.20.1: Rolling-drawdown circuit breaker on BUY ──
    if (d.side === 'BUY' && rollingDdMode === 'block') {
      errors.push(`Skipped BUY ${d.symbol}: rolling 5-day drawdown ${rolling.ddPct.toFixed(2)}% blocks new positions`);
      continue;
    }

    // ── Phase 5: TURBULENCE — block buys in extreme conditions, halve in elevated ──
    if (d.side === 'BUY' && turbulence.level === 'Extreme') {
      errors.push(`Skipped BUY ${d.symbol}: EXTREME market turbulence (${turbulence.turbulence.toFixed(2)})`);
      continue;
    }

    // ── MAX BUYS PER CYCLE ──
    if (d.side === 'BUY' && buysThisCycle >= MAX_BUYS_PER_CYCLE) {
      errors.push(`Skipped BUY ${d.symbol}: max ${MAX_BUYS_PER_CYCLE} buys/cycle reached`);
      continue;
    }

    // Anti-fixation: ignore further BUYs of a symbol the AI already bought recently.
    if (d.side === 'BUY' && (recentBuyCounts.get(d.symbol) ?? 0) >= FIXATION_MAX_BUYS_IN_WINDOW) {
      errors.push(`Skipped BUY ${d.symbol}: anti-fixation (already bought in last ${FIXATION_WINDOW_MIN}m)`);
      continue;
    }

    // FP-1.20.1: Intraday is now ALLOWED (gated above by isIntradayEligible
    // for BUY, and tagged on SELL so the auto force-close pass can run it
    // at 3:25 PM IST). High-frequency / day-trade strategies belong here.

    const stock = db.prepare('SELECT * FROM stocks WHERE symbol = ?').get(d.symbol) as any;
    if (!stock) {
      errors.push(`Unknown symbol ${d.symbol}`);
      continue;
    }
    const q = await fetchYahooQuote(d.symbol, stock.exchange ?? 'NSE');
    if (!q) {
      errors.push(`No quote for ${d.symbol}`);
      continue;
    }
    const tag = (d as any).strategy_tag || accAfter.strategy.toLowerCase();
    try {
      if (d.side === 'SELL') {
        const pos = positionsBySymbol.get(d.symbol);
        const qty = Math.min(d.quantity, pos?.quantity ?? 0);
        if (qty <= 0) continue;
        executeTrade({ accountId: acc.id, stockId: stock.id, side: 'SELL', quantity: qty, price: q.price, reason: d.reason, ai: true, horizon: d.horizon, strategy_tag: tag, market_regime: regimeInfo.regime, ...aiAttr });
      } else {
        // size to capital and per-position cap
        const existing = positionsBySymbol.get(d.symbol);
        const existingNotional = existing ? existing.quantity * q.price : 0;
        const headroom = Math.max(0, maxPosNotional - existingNotional);
        const cashLimit = accAfter.cash * 0.95;

        // ── FP: fold the sector cap into sizing instead of hard-rejecting ──
        // The per-position cap (e.g. 33% for Aggressive) is looser than the 30%
        // sector cap, so a single max-sized buy in an empty sector would always
        // exceed 30% and get rejected — meaning a fresh account could never open
        // its first position. Compute the remaining sector headroom and treat it
        // as just another sizing constraint, so the quantity is shrunk to fit.
        const stockSector = (stock as any).sector || null;
        let sectorHeadroom = Infinity;
        if (stockSector) {
          const curSectorPct = sectorExposurePct(acc.id, stockSector, totalEquityHint, 0);
          sectorHeadroom = Math.max(0, ((SECTOR_CAP_PCT - curSectorPct) / 100) * totalEquityHint);
        }

        // Phase 5: Apply turbulence multiplier to reduce position size in volatile markets
        // FP-1.20.1: Combine turbulence (volatility) + Kelly (edge) + rolling-DD (capital preservation)
        const kelly = kellySizingFactor(strategyStats, tag, finalConviction);
        const rollingMul = rollingDdMode === 'reduce' ? 0.5 : 1.0;
        const sizingMultiplier = turbulence.positionMultiplier * kelly * rollingMul;
        const turbulenceAdjusted = Math.min(headroom, cashLimit, sectorHeadroom) * sizingMultiplier;
        const maxQty = Math.floor(turbulenceAdjusted / q.price);
        const qty = Math.max(0, Math.min(Math.floor(d.quantity), maxQty));
        if (qty <= 0) {
          errors.push(`Skipped BUY ${d.symbol}: position/cash/sector cap leaves no room (sector ${stockSector ?? 'n/a'})`);
          continue;
        }

        // Defense-in-depth: sector cap should already be satisfied by sizing above.
        const sectorPctAfter = sectorExposurePct(acc.id, stockSector, totalEquityHint, qty * q.price);
        if (stockSector && sectorPctAfter > SECTOR_CAP_PCT + 0.5) {
          errors.push(`Skipped BUY ${d.symbol}: sector ${stockSector} would be ${sectorPctAfter.toFixed(1)}% (cap ${SECTOR_CAP_PCT}%)`);
          continue;
        }

        // ── FP-1.20.1: Liquidity floor — kills bad-slippage penny fills ──
        const tov = avgDailyTurnover20d(stock.id);
        if (tov !== null && tov < LIQUIDITY_FLOOR_INR) {
          errors.push(`Skipped BUY ${d.symbol}: 20-day avg turnover ₹${(tov / 1e7).toFixed(2)}cr < ₹${(LIQUIDITY_FLOOR_INR / 1e7).toFixed(0)}cr liquidity floor`);
          continue;
        }

        // ── FP-1.20.1: Intraday eligibility ──
        if (d.horizon === 'Intraday') {
          const e = isIntradayEligible((stock as any).tier);
          if (!e.ok) { errors.push(`Skipped intraday BUY ${d.symbol}: ${e.reason}`); continue; }
        }

        // ── BREAK-EVEN CHECK: ensure expected return justifies costs ──
        const bevenPct = minimumBreakevenPct(q.price, qty);
        // If the trade is too small relative to costs, skip it
        if (bevenPct > 2.0) {
          errors.push(`Skipped BUY ${d.symbol}: break-even ${bevenPct.toFixed(2)}% too high for qty ${qty}`);
          continue;
        }

        executeTrade({ accountId: acc.id, stockId: stock.id, side: 'BUY', quantity: qty, price: q.price, reason: d.reason, ai: true, horizon: d.horizon, strategy_tag: tag, market_regime: regimeInfo.regime, ...aiAttr });
        // Update local map so the AI can't double-spend within the same cycle.
        recentBuyCounts.set(d.symbol, (recentBuyCounts.get(d.symbol) ?? 0) + 1);
        buysThisCycle++;
      }
      executed++;
    } catch (e: any) {
      errors.push(`${d.side} ${d.symbol}: ${e.message}`);
    }
  }

  await recomputeEquity(acc.id);
  logger.info({ userId, decisions: decisions.length, executed, buysThisCycle, errors: errors.length }, 'AI trader cycle complete');
  return {
    decisions,
    executed: executed + forced.length,
    errors,
    forced_closes: forced,
    daily_dd_pct: dailyDdPct,
    ai: aiMeta ? { provider: aiMeta.provider, model: aiMeta.model, upstream_model: aiMeta.upstreamModel, ms: aiMeta.ms } : undefined,
  };
}
