import { db } from '../db/index.js';
import { resolveAIConfig, aiCompleteMeta, type AICallRecord } from './ai.js';
import { fetchYahooQuote } from './prices.js';
import { buildContext } from './predictions.js';
import { fetchMarketNews } from './news.js';
import { isNseOpen } from '../utils/market-hours.js';
import { logger } from '../logger.js';
import { topBuyPicks, listOpportunities } from './discovery.js';

const FEE_RATE = 0.001; // 0.1% round-trip approximation
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
  ).run(userId, startingCapital, startingCapital, JSON.stringify(DEFAULT_UNIVERSE));
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
    const fees = gross * FEE_RATE;
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
      // Realised P&L on this SELL = (sell price - avg cost) * qty - fees.
      realizedPnl = (opts.price - pos.average_price) * opts.quantity - fees;
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
  horizon?: 'Intraday' | 'Short-term' | 'Long-term';
  conviction?: number;
}

/** How recently the AI bought the same symbol counts as "fixation". */
const FIXATION_WINDOW_MIN = 60;
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

  // ── Stop-loss / take-profit pre-pass ──
  const regimeInfo = detectMarketRegime(positions.map((p) => p.symbol).slice(0, 12));
  const forced: Array<{ symbol: string; reason: string }> = [];
  for (const p of positions) {
    const ltp = ltps.get(p.symbol) ?? p.average_price;
    const pnlPct = ((ltp - p.average_price) / p.average_price) * 100;
    if (pnlPct <= -acc.stop_loss_pct) {
      try {
        executeTrade({ accountId: acc.id, stockId: p.stock_id, side: 'SELL', quantity: p.quantity, price: ltp, reason: `Stop-loss ${pnlPct.toFixed(2)}%`, ai: true, strategy_tag: 'risk:stop-loss', market_regime: regimeInfo.regime });
        forced.push({ symbol: p.symbol, reason: `Stop-loss ${pnlPct.toFixed(2)}%` });
      } catch {}
    } else if (pnlPct >= acc.take_profit_pct) {
      try {
        executeTrade({ accountId: acc.id, stockId: p.stock_id, side: 'SELL', quantity: p.quantity, price: ltp, reason: `Take-profit ${pnlPct.toFixed(2)}%`, ai: true, strategy_tag: 'risk:take-profit', market_regime: regimeInfo.regime });
        forced.push({ symbol: p.symbol, reason: `Take-profit ${pnlPct.toFixed(2)}%` });
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
    const buys = topBuyPicks(15);
    const watch = (db
      .prepare(
        `SELECT s.symbol FROM watchlist w JOIN stocks s ON w.stock_id = s.id WHERE w.user_id = ?`,
      )
      .all(userId) as { symbol: string }[]).map((r) => r.symbol);
    const held = positions.map((p) => p.symbol);
    const merged = [...new Set([...buys, ...watch, ...held])];
    universe = merged.length > 0 ? merged.slice(0, 18) : DEFAULT_UNIVERSE;
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
  const ctxSymbols = universe.slice(0, 12);
  await Promise.all(
    ctxSymbols.map(async (sym) => {
      try { ctxs[sym] = await buildContext(sym, 'NSE'); } catch {}
    }),
  );

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
      ? 'Favor breakout / momentum / trend-following entries; trail stops, ride winners.'
      : regimeInfo.regime === 'Bearish'
      ? 'Favor capital preservation; raise cash, tighten stops, only high-conviction longs in defensive sectors.'
      : 'Favor mean-reversion and pair-trades around support/resistance; keep position sizes smaller.';

  const system = `You are an autonomous AI portfolio manager for an Indian-markets paper-trading account.
Strategy: ${accAfter.strategy}. Risk: ${accAfter.risk_level}. Universe mode: ${universeMode}.
Market regime today: ${regimeInfo.regime} (median 20-bar return ${regimeInfo.medianReturnPct.toFixed(2)}%, breadth up=${regimeInfo.breadth.up}/down=${regimeInfo.breadth.down}/flat=${regimeInfo.breadth.flat}).
Playbook for this regime: ${regimePlaybook}
Objective: maximise risk-adjusted return. Avoid concentration; diversify across sectors. Adapt strategy to regime — do not force trend trades in a sideways tape, do not chase mean-reversion in a strong trend.
Hard rules:
- Only operate within these symbols: ${universe.join(', ')}.
- BUY only with available cash ₹${accAfter.cash.toFixed(2)}; never go negative.
- SELL only what is currently held.
- Position-size cap ₹${maxPosNotional.toFixed(0)} per single stock (max ${accAfter.max_position_pct}% of total equity).
- DO NOT BUY any of these symbols this cycle (recently bought, anti-fixation): ${blockedFromBuy.length ? blockedFromBuy.join(', ') : 'none'}.
- Prefer HOLD when signals are weak or technicals conflict; do not force trades.
- Each BUY MUST include an intended holding horizon: "Intraday", "Short-term" (days–weeks) or "Long-term" (months+).
- Each decision MUST tag a strategy_tag from: momentum, mean-reversion, breakout, value, swing, defensive, news-driven, hedge.
- Use the supplied technicals (RSI/MACD/SMA/EMA/Bollinger), recent candles, news headlines, recent predictions, discovery opportunities AND the historical strategy P&L below to bias toward playbooks that have actually worked on THIS account.
- Reduce a position if conviction has dropped or technicals turned negative.
- Take profits proactively on strong rallies (≥1× take_profit_pct away from entry).
- Aim for at most 6–8 BUY decisions per cycle; consolidate over churn.
Respond ONLY as JSON: { "decisions": [ { "symbol": string, "side": "BUY"|"SELL"|"HOLD", "quantity": number, "reason": string, "horizon": "Intraday"|"Short-term"|"Long-term", "strategy_tag": string, "conviction": number /* 0..1 */ } ] }`;

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
Past strategy P&L on this account (closed trades): ${JSON.stringify(strategyStats)}

Per-symbol market context (technicals + last 30 candles + per-symbol news):
${JSON.stringify(ctxs).slice(0, 12_000)}`;

  let decisions: AIAction[] = [];
  let aiMeta: AICallRecord | null = null;
  try {
    const r = await aiCompleteMeta(aiCfg, { prompt, systemPrompt: system, json: true, temperature: 0.3, timeoutMs: 60_000, callerTag: 'paper-trader' });
    aiMeta = r.meta;
    const j = JSON.parse(r.text);
    decisions = (j.decisions ?? []) as AIAction[];
  } catch (e: any) {
    logger.warn({ err: e.message }, 'AI trader cycle: bad response');
    await recomputeEquity(acc.id);
    return { decisions: [], executed: 0, errors: [e.message], forced_closes: forced, daily_dd_pct: dailyDdPct };
  }

  const errors: string[] = [];
  let executed = 0;
  const aiAttr = aiMeta
    ? { ai_provider: aiMeta.provider, ai_model: aiMeta.model, ai_upstream_model: aiMeta.upstreamModel, ai_latency_ms: aiMeta.ms }
    : {};
  for (const d of decisions) {
    if (d.side === 'HOLD' || !d.quantity || d.quantity <= 0) continue;
    if (!universe.includes(d.symbol)) {
      errors.push(`Skipped ${d.symbol}: outside universe`);
      continue;
    }
    // Anti-fixation: ignore further BUYs of a symbol the AI already bought recently.
    if (d.side === 'BUY' && (recentBuyCounts.get(d.symbol) ?? 0) >= FIXATION_MAX_BUYS_IN_WINDOW) {
      errors.push(`Skipped BUY ${d.symbol}: anti-fixation (already bought in last ${FIXATION_WINDOW_MIN}m)`);
      continue;
    }
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
        const maxQty = Math.floor(Math.min(headroom, cashLimit) / q.price);
        const qty = Math.max(0, Math.min(Math.floor(d.quantity), maxQty));
        if (qty <= 0) {
          errors.push(`Skipped BUY ${d.symbol}: position-cap or cash limit (max ${maxQty})`);
          continue;
        }
        executeTrade({ accountId: acc.id, stockId: stock.id, side: 'BUY', quantity: qty, price: q.price, reason: d.reason, ai: true, horizon: d.horizon, strategy_tag: tag, market_regime: regimeInfo.regime, ...aiAttr });
        // Update local map so the AI can't double-spend within the same cycle.
        recentBuyCounts.set(d.symbol, (recentBuyCounts.get(d.symbol) ?? 0) + 1);
      }
      executed++;
    } catch (e: any) {
      errors.push(`${d.side} ${d.symbol}: ${e.message}`);
    }
  }

  await recomputeEquity(acc.id);
  return {
    decisions,
    executed: executed + forced.length,
    errors,
    forced_closes: forced,
    daily_dd_pct: dailyDdPct,
    ai: aiMeta ? { provider: aiMeta.provider, model: aiMeta.model, upstream_model: aiMeta.upstreamModel, ms: aiMeta.ms } : undefined,
  };
}
