import axios from 'axios';
import { db } from '../db/index.js';
import { logger } from '../logger.js';
import { computeTechnicals, type TechnicalSnapshot } from './technicals.js';

export interface PriceQuote {
  symbol: string;
  price: number;
  change?: number;
  changePct?: number;
  volume?: number;
  source: string;
  asOf: string;
}

/**
 * Fetches a real-time quote from Yahoo Finance (free, no key).
 * Indian symbols are mapped automatically: RELIANCE -> RELIANCE.NS
 *
 * NOTE: Yahoo's /v7/finance/quote endpoint started returning 401 Unauthorized
 * in 2024 unless you supply a session cookie + crumb. We use the public
 * /v8/finance/chart endpoint instead, which still serves regularMarketPrice
 * + previousClose without any auth.
 */
export async function fetchYahooQuote(symbol: string, exchange = 'NSE'): Promise<PriceQuote | null> {
  const yahooSymbol =
    symbol.includes('.') ? symbol : exchange === 'NSE' ? `${symbol}.NS` : exchange === 'BSE' ? `${symbol}.BO` : symbol;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=2d`;
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    });
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    const price = Number(meta.regularMarketPrice);
    const prevClose = Number(meta.chartPreviousClose ?? meta.previousClose ?? price);
    const change = price - prevClose;
    const changePct = prevClose ? (change / prevClose) * 100 : 0;
    return {
      symbol,
      price,
      change,
      changePct,
      volume: meta.regularMarketVolume,
      source: 'yahoo',
      asOf: new Date((meta.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    };
  } catch (e: any) {
    logger.warn({ err: e.message, symbol }, 'Yahoo quote failed');
    return null;
  }
}

export interface OHLC {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Daily candles for the last `days` days (Yahoo). */
export async function fetchYahooHistory(
  symbol: string,
  exchange = 'NSE',
  days = 120,
): Promise<OHLC[]> {
  const yahooSymbol =
    symbol.includes('.') ? symbol : exchange === 'NSE' ? `${symbol}.NS` : exchange === 'BSE' ? `${symbol}.BO` : symbol;
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - days * 24 * 60 * 60;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?period1=${period1}&period2=${period2}&interval=1d`;
    const { data } = await axios.get(url, {
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' },
    });
    const r = data?.chart?.result?.[0];
    if (!r) return [];
    const t: number[] = r.timestamp ?? [];
    const q = r.indicators?.quote?.[0] ?? {};
    return t
      .map((ts, i) => ({
        t: ts,
        open: q.open?.[i],
        high: q.high?.[i],
        low: q.low?.[i],
        close: q.close?.[i],
        volume: q.volume?.[i] ?? 0,
      }))
      .filter((c) => c.close != null);
  } catch (e: any) {
    logger.warn({ err: e.message, symbol }, 'Yahoo history failed');
    return [];
  }
}

/**
 * Snapshot live quotes for a set of stocks and persist them to `stock_prices`.
 * Best-effort + bounded concurrency. This is what keeps the price-history table
 * populated so that market-regime detection, the turbulence index, the liquidity
 * floor and the manual-trade cached-price fallback all have data to work with.
 * Returns counts so the scheduler can log progress.
 */
export async function snapshotPrices(
  stocks: Array<{ id: number; symbol: string; exchange: string }>,
  concurrency = 5,
): Promise<{ recorded: number; failed: number }> {
  let recorded = 0;
  let failed = 0;
  let i = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (i < stocks.length) {
      const s = stocks[i++];
      try {
        const q = await fetchYahooQuote(s.symbol, s.exchange);
        if (q) {
          recordPrice(s.id, q);
          recorded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  });
  await Promise.all(workers);
  return { recorded, failed };
}

/** Persist a price tick. Used by sync jobs. */
export function recordPrice(stockId: number, q: PriceQuote): void {
  db.prepare(
    `INSERT INTO stock_prices (stock_id, price, change_p, volume, timestamp)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
  ).run(stockId, q.price, q.changePct ?? null, q.volume ?? null);
}

/** Get latest stored price for a stock. */
export function latestPrice(stockId: number): number | null {
  const row = db
    .prepare('SELECT price FROM stock_prices WHERE stock_id = ? ORDER BY timestamp DESC LIMIT 1')
    .get(stockId) as { price: number } | undefined;
  return row?.price ?? null;
}

export async function snapshotTechnicals(symbol: string, exchange = 'NSE'): Promise<TechnicalSnapshot | null> {
  const candles = await fetchYahooHistory(symbol, exchange, 120);
  if (candles.length === 0) return null;
  return computeTechnicals(candles.map((c) => c.close));
}
