import { db } from '../db/index.js';
import { logger } from '../logger.js';
import { resolveAIConfig, aiComplete, type ResolvedAI } from './ai.js';
import { fetchYahooQuote, fetchYahooHistory } from './prices.js';
import { computeTechnicals } from './technicals.js';

/**
 * Discovery scanner — analyses a wide cross-cap universe in batches and writes
 * the top opportunities to `stock_opportunities`. The Playground AI trader can
 * then pull the latest top-N picks instead of being constrained to a small
 * static list. Runs every few hours; calls the AI in chunks to avoid blowing
 * past rate limits.
 */

interface StockRow {
  id: number;
  symbol: string;
  name: string;
  sector: string;
  exchange: string;
  tier: string | null;
}

interface MiniSnapshot {
  symbol: string;
  sector: string;
  tier: string | null;
  price: number | null;
  changePct: number | null;
  rsi14: number | null;
  sma20: number | null;
  sma50: number | null;
  pctFrom52wHigh: number | null;
  pctFrom52wLow: number | null;
  change30d: number | null;
}

const BATCH_SIZE = 5;             // symbols per AI call
const MAX_SYMBOLS = 60;           // hard ceiling per scan run
const CONCURRENCY = 4;            // parallel quote fetches

async function pLimit<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { await fn(items[idx]); } catch {}
    }
  });
  await Promise.all(workers);
}

async function buildSnapshot(s: StockRow): Promise<MiniSnapshot | null> {
  try {
    const [q, hist] = await Promise.all([
      fetchYahooQuote(s.symbol, s.exchange),
      fetchYahooHistory(s.symbol, s.exchange, 260),
    ]);
    if (!q || hist.length < 20) return null;
    const closes = hist.map((h) => h.close);
    const tech = computeTechnicals(closes);
    const high52 = Math.max(...closes.slice(-252));
    const low52 = Math.min(...closes.slice(-252));
    return {
      symbol: s.symbol,
      sector: s.sector,
      tier: s.tier,
      price: q.price,
      changePct: q.changePct ?? null,
      rsi14: tech?.rsi14 ?? null,
      sma20: tech?.sma20 ?? null,
      sma50: tech?.sma50 ?? null,
      pctFrom52wHigh: high52 ? ((q.price - high52) / high52) * 100 : null,
      pctFrom52wLow: low52 ? ((q.price - low52) / low52) * 100 : null,
      change30d: tech?.priceChange30d ?? null,
    };
  } catch {
    return null;
  }
}

interface AIVerdict {
  symbol: string;
  score: number;          // 0..100
  direction: 'BUY' | 'HOLD' | 'AVOID';
  horizon: 'Intraday' | 'Short-term' | 'Long-term';
  expected_upside_pct: number;
  risk_level: 'Low' | 'Medium' | 'High';
  rationale: string;
  strategy: string;
}

async function analyseBatch(snaps: MiniSnapshot[], cfg: ResolvedAI): Promise<AIVerdict[]> {
  const system = `You are a senior multi-strategy Indian-equity analyst. For EACH stock provided, score its near-term opportunity 0..100 and choose a holding horizon.
Return ONLY JSON: { "verdicts": [ { "symbol": string, "score": number, "direction": "BUY"|"HOLD"|"AVOID", "horizon": "Intraday"|"Short-term"|"Long-term", "expected_upside_pct": number, "risk_level": "Low"|"Medium"|"High", "rationale": string, "strategy": string } ] }
Be calibrated: do NOT recommend BUY for everything. Treat penny/micro-caps with extra risk weighting. Score must reflect signal-to-noise.`;
  const prompt = `Snapshots:\n${JSON.stringify(snaps, null, 2)}`;
  // FP-1.20: Discovery uses strict-JSON providers (groq/nvidia honor json_object cleanly).
  // Avoid pollinations and cloudflare which truncate JSON mid-array on the verdicts batch.
  // Retry once with temperature 0 + nvidia preference if the first parse fails — minimises
  // the ~17%% "batch failed" error rate we were seeing.
  const baseOpts = {
    prompt,
    systemPrompt: system,
    json: true as const,
    temperature: 0.3,
    timeoutMs: 60_000,
    callerTag: 'discovery' as const,
    preferProvider: 'groq',
    avoidProviders: ['pollinations', 'huggingface'],
  };
  let raw = await aiComplete(cfg, baseOpts);
  // Light parse-probe: if not valid JSON, retry once with stricter settings.
  const looksValid = (s: string) => {
    const t = s.trim();
    if (!t.startsWith('{')) return false;
    try { JSON.parse(t); return true; } catch { return /\}\s*$/.test(t); }
  };
  if (!looksValid(raw)) {
    raw = await aiComplete(cfg, {
      ...baseOpts,
      temperature: 0,
      preferProvider: 'nvidia',
      timeoutMs: 75_000,
    });
  }
  let j: any = {};
  try { j = JSON.parse(raw); } catch { const m = /\{[\s\S]*\}/.exec(raw); if (m) j = JSON.parse(m[0]); }
  const out: AIVerdict[] = Array.isArray(j.verdicts) ? j.verdicts : [];
  return out
    .filter((v) => v && v.symbol)
    .map((v) => ({
      symbol: String(v.symbol).toUpperCase(),
      score: Math.max(0, Math.min(100, Number(v.score) || 0)),
      direction: ['BUY', 'HOLD', 'AVOID'].includes(v.direction) ? v.direction : 'HOLD',
      horizon: ['Intraday', 'Short-term', 'Long-term'].includes(v.horizon) ? v.horizon : 'Short-term',
      expected_upside_pct: Number(v.expected_upside_pct) || 0,
      risk_level: ['Low', 'Medium', 'High'].includes(v.risk_level) ? v.risk_level : 'Medium',
      rationale: String(v.rationale ?? ''),
      strategy: String(v.strategy ?? ''),
    }));
}

/**
 * Scan a balanced cross-cap sample and persist top opportunities.
 * Returns count of opportunities written.
 */
export async function runDiscoveryScan(adminUserId: number): Promise<{ scanned: number; written: number; errors: number }> {
  const cfg = resolveAIConfig(adminUserId);

  // Balanced sample: take some from each tier so penny/small caps aren't ignored.
  const tiers: Array<[string, number]> = [
    ['large', 18],
    ['mid', 14],
    ['small', 10],
    ['micro', 8],
    ['penny', 6],
    ['etf', 2],
  ];
  const stocks: StockRow[] = [];
  for (const [tier, n] of tiers) {
    const rows = db
      .prepare(`SELECT id, symbol, name, sector, exchange, tier FROM stocks WHERE tier = ? ORDER BY RANDOM() LIMIT ?`)
      .all(tier, n) as StockRow[];
    stocks.push(...rows);
  }
  if (stocks.length === 0) {
    return { scanned: 0, written: 0, errors: 0 };
  }
  const limited = stocks.slice(0, MAX_SYMBOLS);

  // Build snapshots in parallel (Yahoo can handle modest fan-out)
  const snaps: MiniSnapshot[] = [];
  await pLimit(limited, CONCURRENCY, async (s) => {
    const sn = await buildSnapshot(s);
    if (sn) snaps.push(sn);
  });
  if (snaps.length === 0) {
    logger.warn('Discovery scan: no usable snapshots');
    return { scanned: 0, written: 0, errors: 1 };
  }

  // Chunk and analyse
  const verdicts: AIVerdict[] = [];
  let errors = 0;
  for (let i = 0; i < snaps.length; i += BATCH_SIZE) {
    const chunk = snaps.slice(i, i + BATCH_SIZE);
    try {
      const v = await analyseBatch(chunk, cfg);
      verdicts.push(...v);
    } catch (e: any) {
      errors++;
      logger.warn({ err: e.message, batch: i }, 'Discovery batch failed');
    }
  }

  // Persist (clear old rows older than 7 days to keep table tidy)
  db.prepare(`DELETE FROM stock_opportunities WHERE created_at < datetime('now','-7 day')`).run();
  const symToId = new Map<string, number>();
  for (const s of limited) symToId.set(s.symbol, s.id);
  const ins = db.prepare(
    `INSERT INTO stock_opportunities
       (stock_id, score, direction, horizon, expected_upside_pct, risk_level, rationale, strategy, ai_provider)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let written = 0;
  for (const v of verdicts) {
    const sid = symToId.get(v.symbol);
    if (!sid) continue;
    ins.run(sid, v.score, v.direction, v.horizon, v.expected_upside_pct, v.risk_level, v.rationale, v.strategy, cfg.provider);
    written++;
  }
  logger.info({ scanned: snaps.length, written, errors }, 'Discovery scan complete');
  return { scanned: snaps.length, written, errors };
}

/** Latest opportunities (one per stock — most recent), ranked by score. */
export function listOpportunities(limit = 50, direction?: 'BUY' | 'HOLD' | 'AVOID'): any[] {
  const where = direction ? 'AND o.direction = ?' : '';
  const args: any[] = [];
  if (direction) args.push(direction);
  args.push(limit);
  return db.prepare(
    `SELECT o.*, s.symbol, s.name, s.sector, s.tier, s.exchange
     FROM stock_opportunities o
     JOIN stocks s ON o.stock_id = s.id
     WHERE o.id IN (
       SELECT MAX(id) FROM stock_opportunities GROUP BY stock_id
     ) ${where}
     ORDER BY o.score DESC
     LIMIT ?`,
  ).all(...args);
}

/** Top BUY symbols (for AI trader dynamic universe). */
export function topBuyPicks(limit = 12): string[] {
  const rows = listOpportunities(limit, 'BUY');
  return rows.map((r) => r.symbol);
}
