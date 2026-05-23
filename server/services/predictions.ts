import { db } from '../db/index.js';
import { resolveAIConfig, aiComplete } from './ai.js';
import { fetchYahooHistory, fetchYahooQuote } from './prices.js';
import { computeTechnicals, computeEnhancedTechnicals } from './technicals.js';
import { fetchMarketNews } from './news.js';
import { getSymbolSentiment, getMarketSentiment } from './sentiment.js';
import { logger } from '../logger.js';

export type Strategy = 'Buffett' | 'Lynch' | 'Graham' | 'Momentum' | 'MeanReversion' | 'Balanced';
export const STRATEGIES: Strategy[] = ['Buffett', 'Lynch', 'Graham', 'Momentum', 'MeanReversion', 'Balanced'];

const STRATEGY_PROMPTS: Record<Strategy, string> = {
  Buffett:
    'Adopt the lens of Warren Buffett: durable competitive moat, return on capital, predictable earnings, owner-style long-term thinking, margin of safety.',
  Lynch:
    'Adopt the lens of Peter Lynch: PEG ratio, growth at a reasonable price, simple businesses you understand, avoid hot industries.',
  Graham:
    'Adopt the lens of Benjamin Graham: deep-value, P/B and P/E discounts, current ratio strength, large margin of safety to intrinsic value.',
  Momentum:
    'Adopt a momentum / trend-following lens: 52-week breakouts, strong relative strength, MACD/RSI confirmation, ride winners cut losers.',
  MeanReversion:
    'Adopt a mean-reversion lens: oversold RSI, distance below 200-day SMA, reversion to value, contrarian entries.',
  Balanced:
    'Adopt a balanced multi-factor lens: combine value, quality, growth, momentum and macro signals; weigh evidence and avoid single-factor bets.',
};

export interface PredictionInput {
  userId: number;
  stockId: number;
  horizon: '2-7d' | '1m' | '3-12m' | 'LT';
  strategy?: Strategy;
}

export interface PredictionResult {
  direction: 'UP' | 'DOWN' | 'SIDEWAYS';
  expected_move_p: number; // percent, positive or negative
  target_price: number;
  confidence: number; // 0..1
  explanation: string;
  key_drivers: string[];
  risks: string[];
}

/**
 * Build the rich market context: price history, technicals, latest quote, recent news, sentiment.
 * This is what the AI sees - quality of this dataset determines prediction quality.
 */
export async function buildContext(symbol: string, exchange = 'NSE') {
  const [history, quote, news] = await Promise.all([
    fetchYahooHistory(symbol, exchange, 180),
    fetchYahooQuote(symbol, exchange),
    fetchMarketNews([symbol]),
  ]);
  const closes = history.map((h) => h.close);
  const highs = history.map((h) => h.high ?? h.close);
  const lows = history.map((h) => h.low ?? h.close);
  const volumes = history.map((h) => h.volume ?? 0);
  const tech = computeTechnicals(closes);
  const enhanced = computeEnhancedTechnicals(closes, highs, lows, volumes);
  const sentiment = getSymbolSentiment(symbol, 7);
  return {
    quote,
    technicals: tech,
    enhanced,
    sentiment,
    recent_candles: history.slice(-30),
    news: news.slice(0, 10).map((n) => ({ headline: n.headline, source: n.source, at: n.publishedAt })),
  };
}

const HORIZON_DAYS: Record<PredictionInput['horizon'], number> = {
  '2-7d': 7,
  '1m': 30,
  '3-12m': 180,
  LT: 365,
};

export async function generatePrediction(input: PredictionInput): Promise<{
  id: number;
  result: PredictionResult;
  contextSummary: { hasPrice: boolean; hasTechnicals: boolean; newsCount: number };
}> {
  const stock = db.prepare('SELECT * FROM stocks WHERE id = ?').get(input.stockId) as any;
  if (!stock) throw new Error('Stock not found');

  const ctx = await buildContext(stock.symbol, stock.exchange);
  const aiCfg = resolveAIConfig(input.userId);
  const strategy = input.strategy ?? 'Balanced';

  const system = `You are a senior Indian equity analyst at a top hedge fund. ${STRATEGY_PROMPTS[strategy]}
Respond ONLY with valid JSON matching this TypeScript type:
{
  "direction": "UP" | "DOWN" | "SIDEWAYS",
  "expected_move_p": number,        // signed percent move expected over the horizon
  "target_price": number,            // INR target
  "confidence": number,              // 0..1
  "explanation": string,             // 3-5 sentences, technical + fundamental + sentiment evidence
  "key_drivers": string[],           // 2-5 bullet drivers
  "risks": string[]                  // 2-5 bullet risks
}`;

  const prompt = `Symbol: ${stock.symbol} (${stock.name}), sector: ${stock.sector}, exchange: ${stock.exchange}.
Time horizon: ${input.horizon} (~${HORIZON_DAYS[input.horizon]} trading days).
Strategy lens: ${strategy}.

Market data context (JSON):
${JSON.stringify(ctx, null, 2)}

Analyse this evidence and produce the JSON response. Be calibrated: confidence should reflect actual signal strength, not optimism.`;

  const raw = await aiComplete(aiCfg, { prompt, systemPrompt: system, json: true, temperature: 0.2, callerTag: 'predictions' });

  let parsed: PredictionResult;
  try {
    parsed = JSON.parse(raw) as PredictionResult;
  } catch (e: any) {
    logger.warn({ raw }, 'AI returned non-JSON, attempting recovery');
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) throw new Error('AI response was not parseable JSON');
    parsed = JSON.parse(m[0]);
  }

  // Sanitise
  parsed.direction = (['UP', 'DOWN', 'SIDEWAYS'] as const).includes(parsed.direction as any)
    ? parsed.direction
    : 'SIDEWAYS';
  parsed.confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  parsed.expected_move_p = Number(parsed.expected_move_p) || 0;
  parsed.target_price = Number(parsed.target_price) || (ctx.quote?.price ?? 0);

  const validateAfter = new Date(Date.now() + HORIZON_DAYS[input.horizon] * 24 * 60 * 60 * 1000).toISOString();

  const info = db
    .prepare(
      `INSERT INTO predictions
        (stock_id, user_id, direction, expected_move_p, target_price, horizon, confidence,
         ai_explanation, strategy, model_version, input_snapshot, status, validate_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
    )
    .run(
      input.stockId,
      input.userId,
      parsed.direction,
      parsed.expected_move_p,
      parsed.target_price,
      input.horizon,
      parsed.confidence,
      parsed.explanation,
      strategy,
      `${aiCfg.provider}/${aiCfg.model}`,
      JSON.stringify({
        price: ctx.quote?.price,
        technicals: ctx.technicals,
        technicalStrength: ctx.enhanced?.technicalStrength ?? null,
        sentiment_score: ctx.sentiment?.avgScore ?? null,
        sentiment_trend: ctx.sentiment?.trend ?? null,
      }),
      validateAfter,
    );

  return {
    id: Number(info.lastInsertRowid),
    result: parsed,
    contextSummary: {
      hasPrice: !!ctx.quote,
      hasTechnicals: !!ctx.technicals,
      newsCount: ctx.news.length,
    },
  };
}

/**
 * Run validation pass on predictions whose horizon has elapsed.
 * Updates result + actual_move_p + feature_reliability accordingly.
 */
export async function validatePendingPredictions(): Promise<{ checked: number; validated: number }> {
  const due = db
    .prepare(
      `SELECT p.id, p.stock_id, p.direction, p.expected_move_p, p.input_snapshot, s.symbol, s.exchange
       FROM predictions p JOIN stocks s ON p.stock_id = s.id
       WHERE p.status = 'PENDING' AND p.validate_after IS NOT NULL AND p.validate_after <= CURRENT_TIMESTAMP
       LIMIT 50`,
    )
    .all() as Array<any>;

  let validated = 0;
  for (const p of due) {
    const q = await fetchYahooQuote(p.symbol, p.exchange ?? 'NSE');
    if (!q) continue;
    let snapshot: any = {};
    try { snapshot = JSON.parse(p.input_snapshot ?? '{}'); } catch {}
    const startPrice = snapshot.price as number | undefined;
    if (!startPrice) {
      db.prepare(`UPDATE predictions SET status='VALIDATED', result='UNKNOWN', validated_at=CURRENT_TIMESTAMP WHERE id=?`).run(p.id);
      continue;
    }
    const actualMoveP = ((q.price - startPrice) / startPrice) * 100;
    const wentUp = actualMoveP > 0.5;
    const wentDown = actualMoveP < -0.5;
    const dir = p.direction;
    let result: 'ACCURATE' | 'PARTIAL' | 'FAILED';
    if ((dir === 'UP' && wentUp) || (dir === 'DOWN' && wentDown) || (dir === 'SIDEWAYS' && !wentUp && !wentDown)) {
      result = 'ACCURATE';
    } else if (Math.sign(actualMoveP) === Math.sign(p.expected_move_p)) {
      result = 'PARTIAL';
    } else {
      result = 'FAILED';
    }
    db.prepare(
      `UPDATE predictions SET status='VALIDATED', result=?, actual_move_p=?, validated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).run(result, actualMoveP, p.id);
    validated++;
  }
  return { checked: due.length, validated };
}

/**
 * Find top N picks across the user's universe + watchlist by ranking
 * Balanced-strategy predictions on confidence × |expected_move|.
 *
 * Pacing: Arbiter (default) rotates across 12+ providers and has internal
 * rate-limit handling, so we run with no inter-call delay.  Direct Gemini
 * free-tier is capped at 5 RPM/model, so when the resolved provider is Gemini
 * we cap candidates and pace ~13 s/call.
 */
export async function runTopPicks(userId: number, limit = 5, horizon: PredictionInput['horizon'] = '1m') {
  const probeCfg = resolveAIConfig(userId);
  const isFastProvider = probeCfg.provider !== 'Gemini';
  const interCallDelayMs = isFastProvider ? 0 : 13_000;
  const candidateCap = isFastProvider ? 12 : 8;

  // Gather universe from paper account + watchlist symbols
  const account = db.prepare('SELECT universe FROM paper_accounts WHERE user_id = ?').get(userId) as { universe: string | null } | undefined;
  let symbols: string[] = [];
  try { if (account?.universe) symbols = JSON.parse(account.universe); } catch {}
  const watch = db
    .prepare(`SELECT DISTINCT s.symbol FROM watchlist w JOIN stocks s ON w.stock_id = s.id WHERE w.user_id = ?`)
    .all(userId) as Array<{ symbol: string }>;
  for (const w of watch) if (!symbols.includes(w.symbol)) symbols.push(w.symbol);
  if (!symbols.length) {
    symbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'ITC', 'SBIN', 'LT'];
  }
  symbols = symbols.slice(0, candidateCap);

  type Pick = {
    id: number;
    symbol: string;
    direction: PredictionResult['direction'];
    confidence: number;
    expected_move_p: number;
    target_price: number;
    score: number;
    explanation: string;
  };
  const picks: Pick[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    const stock = db.prepare('SELECT id, symbol FROM stocks WHERE symbol = ?').get(sym) as { id: number; symbol: string } | undefined;
    if (!stock) continue;
    try {
      const r = await generatePrediction({ userId, stockId: stock.id, horizon, strategy: 'Balanced' });
      picks.push({
        id: r.id,
        symbol: stock.symbol,
        direction: r.result.direction,
        confidence: r.result.confidence,
        expected_move_p: r.result.expected_move_p,
        target_price: r.result.target_price,
        score: r.result.confidence * Math.abs(r.result.expected_move_p),
        explanation: r.result.explanation,
      });
    } catch (e: any) {
      logger.warn({ symbol: sym, err: String(e?.message ?? e).slice(0, 200) }, 'top-picks: generation failed');
      // If we hit a rate-limit, pause longer before next attempt to recover the bucket.
      if (/429|RESOURCE_EXHAUSTED|rate/i.test(String(e?.message ?? ''))) {
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
    // Inter-call delay (only when the resolved provider has tight RPM caps)
    if (i < symbols.length - 1 && interCallDelayMs > 0) {
      await new Promise((r) => setTimeout(r, interCallDelayMs));
    }
  }
  picks.sort((a, b) => b.score - a.score);
  return picks.slice(0, Math.max(1, Math.min(limit, 10)));
}
