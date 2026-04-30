/**
 * Pure technical indicators on closing-price arrays. No external deps.
 * Inputs are oldest-first arrays.
 */

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  let avgG = gains / period;
  let avgL = losses / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

export function macd(values: number[]): { macd: number; signal: number; histogram: number } | null {
  if (values.length < 35) return null;
  const e12 = ema(values, 12);
  const e26 = ema(values, 26);
  if (e12 == null || e26 == null) return null;
  const macdLine = e12 - e26;
  // crude signal: 9-period EMA of MACD using rolling
  const macdSeries: number[] = [];
  for (let i = 26; i <= values.length; i++) {
    const slice = values.slice(0, i);
    const a = ema(slice, 12);
    const b = ema(slice, 26);
    if (a != null && b != null) macdSeries.push(a - b);
  }
  const sig = ema(macdSeries, 9);
  if (sig == null) return null;
  return { macd: macdLine, signal: sig, histogram: macdLine - sig };
}

export function bollinger(values: number[], period = 20, mult = 2) {
  const m = sma(values, period);
  if (m == null) return null;
  const slice = values.slice(-period);
  const variance = slice.reduce((s, v) => s + (v - m) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  return { middle: m, upper: m + mult * sd, lower: m - mult * sd };
}

export interface TechnicalSnapshot {
  close: number;
  sma20: number | null;
  sma50: number | null;
  ema20: number | null;
  rsi14: number | null;
  macd: ReturnType<typeof macd>;
  bollinger: ReturnType<typeof bollinger>;
  priceChange1d: number | null;
  priceChange7d: number | null;
  priceChange30d: number | null;
}

export function computeTechnicals(closes: number[]): TechnicalSnapshot | null {
  if (closes.length === 0) return null;
  const last = closes[closes.length - 1];
  const pct = (n: number) =>
    closes.length > n ? ((last - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100 : null;
  return {
    close: last,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    ema20: ema(closes, 20),
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    bollinger: bollinger(closes, 20, 2),
    priceChange1d: pct(1),
    priceChange7d: pct(7),
    priceChange30d: pct(30),
  };
}
