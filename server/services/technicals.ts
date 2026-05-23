/**
 * Pure technical indicators on price/volume arrays. No external deps.
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

// ─── Phase 2: Enhanced indicators (Alpha158-inspired) ───────────────────────

/** Average True Range — volatility indicator */
export function atr(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period + 1) return null;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
    trs.push(tr);
  }
  if (trs.length < period) return null;
  let atrVal = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
  }
  return atrVal;
}

/** On-Balance Volume */
export function obv(closes: number[], volumes: number[]): number | null {
  if (closes.length < 2 || volumes.length < closes.length) return null;
  let val = 0;
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) val += volumes[i];
    else if (closes[i] < closes[i - 1]) val -= volumes[i];
  }
  return val;
}

/** Volume-Weighted Average Price (approx from OHLCV) */
export function vwap(highs: number[], lows: number[], closes: number[], volumes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  let cumTPV = 0, cumVol = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const tp = (highs[i] + lows[i] + closes[i]) / 3;
    cumTPV += tp * volumes[i];
    cumVol += volumes[i];
  }
  return cumVol > 0 ? cumTPV / cumVol : null;
}

/** Williams %R */
export function williamsR(highs: number[], lows: number[], closes: number[], period = 14): number | null {
  if (highs.length < period) return null;
  const hSlice = highs.slice(-period);
  const lSlice = lows.slice(-period);
  const hh = Math.max(...hSlice);
  const ll = Math.min(...lSlice);
  if (hh === ll) return -50;
  return ((hh - closes[closes.length - 1]) / (hh - ll)) * -100;
}

/** Stochastic %K and %D */
export function stochastic(highs: number[], lows: number[], closes: number[], kPeriod = 14, dPeriod = 3): { k: number; d: number } | null {
  if (highs.length < kPeriod + dPeriod) return null;
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const hSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lSlice = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...hSlice);
    const ll = Math.min(...lSlice);
    kValues.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  const k = kValues[kValues.length - 1];
  const d = kValues.length >= dPeriod
    ? kValues.slice(-dPeriod).reduce((s, v) => s + v, 0) / dPeriod
    : k;
  return { k, d };
}

/** Commodity Channel Index */
export function cci(highs: number[], lows: number[], closes: number[], period = 20): number | null {
  if (closes.length < period) return null;
  const tps: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    tps.push((highs[i] + lows[i] + closes[i]) / 3);
  }
  const mean = tps.reduce((s, v) => s + v, 0) / period;
  const meanDev = tps.reduce((s, v) => s + Math.abs(v - mean), 0) / period;
  return meanDev === 0 ? 0 : (tps[tps.length - 1] - mean) / (0.015 * meanDev);
}

/** Rate of Change */
export function roc(values: number[], period = 12): number | null {
  if (values.length <= period) return null;
  const prev = values[values.length - 1 - period];
  return prev === 0 ? null : ((values[values.length - 1] - prev) / prev) * 100;
}

/** ADX (Average Directional Index) + DI+/DI- */
export function adx(highs: number[], lows: number[], closes: number[], period = 14): { adx: number; diPlus: number; diMinus: number } | null {
  if (highs.length < period * 2 + 1) return null;
  const dmPlus: number[] = [];
  const dmMinus: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
    dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }

  // Smooth with Wilder's method
  let smoothTR = trs.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothDP = dmPlus.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothDM = dmMinus.slice(0, period).reduce((s, v) => s + v, 0);
  const dxValues: number[] = [];

  for (let i = period; i < trs.length; i++) {
    smoothTR = smoothTR - smoothTR / period + trs[i];
    smoothDP = smoothDP - smoothDP / period + dmPlus[i];
    smoothDM = smoothDM - smoothDM / period + dmMinus[i];
    const diP = smoothTR > 0 ? (smoothDP / smoothTR) * 100 : 0;
    const diM = smoothTR > 0 ? (smoothDM / smoothTR) * 100 : 0;
    const dx = diP + diM > 0 ? (Math.abs(diP - diM) / (diP + diM)) * 100 : 0;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;
  let adxVal = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adxVal = (adxVal * (period - 1) + dxValues[i]) / period;
  }

  const lastDiP = smoothTR > 0 ? (smoothDP / smoothTR) * 100 : 0;
  const lastDiM = smoothTR > 0 ? (smoothDM / smoothTR) * 100 : 0;
  return { adx: adxVal, diPlus: lastDiP, diMinus: lastDiM };
}

/** Historical (realized) volatility — annualized std dev of log returns */
export function historicalVolatility(closes: number[], period = 20): number | null {
  if (closes.length < period + 1) return null;
  const logRets: number[] = [];
  for (let i = closes.length - period; i < closes.length; i++) {
    logRets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = logRets.reduce((s, v) => s + v, 0) / logRets.length;
  const variance = logRets.reduce((s, v) => s + (v - mean) ** 2, 0) / (logRets.length - 1);
  return Math.sqrt(variance * 252) * 100; // annualized %
}

/** Volume SMA ratio — current volume vs average */
export function volumeRatio(volumes: number[], period = 20): number | null {
  if (volumes.length < period) return null;
  const avg = volumes.slice(-period).reduce((s, v) => s + v, 0) / period;
  return avg > 0 ? volumes[volumes.length - 1] / avg : null;
}

/** Distance from 52-week high/low (in %) */
export function pricePosition52w(closes: number[]): { fromHigh: number; fromLow: number } | null {
  if (closes.length < 50) return null; // need at least ~50 trading days
  const window = closes.slice(-252); // ~1 year
  const high = Math.max(...window);
  const low = Math.min(...window);
  const last = closes[closes.length - 1];
  return {
    fromHigh: ((last - high) / high) * 100,
    fromLow: ((last - low) / low) * 100,
  };
}

// ─── Existing interface + expanded ──────────────────────────────────────────

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

export interface EnhancedTechnicals extends TechnicalSnapshot {
  atr14: number | null;
  adx14: { adx: number; diPlus: number; diMinus: number } | null;
  obv: number | null;
  vwap20: number | null;
  williamsR14: number | null;
  stochastic: { k: number; d: number } | null;
  cci20: number | null;
  roc12: number | null;
  historicalVol20: number | null;
  volumeRatio20: number | null;
  pricePosition52w: { fromHigh: number; fromLow: number } | null;
  technicalStrength: number; // 0-100 composite score
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

/**
 * Enhanced technical analysis with ~30 factors (Alpha158-inspired).
 * Requires OHLCV data. Falls back gracefully if only closes are available.
 */
export function computeEnhancedTechnicals(
  closes: number[],
  highs?: number[],
  lows?: number[],
  volumes?: number[],
): EnhancedTechnicals | null {
  const base = computeTechnicals(closes);
  if (!base) return null;

  const h = highs ?? closes;
  const l = lows ?? closes;
  const v = volumes ?? [];

  // Compute all enhanced indicators
  const atr14 = atr(h, l, closes, 14);
  const adx14 = adx(h, l, closes, 14);
  const obvVal = v.length >= closes.length ? obv(closes, v) : null;
  const vwap20 = v.length >= closes.length ? vwap(h, l, closes, v, 20) : null;
  const wr14 = williamsR(h, l, closes, 14);
  const stoch = stochastic(h, l, closes, 14, 3);
  const cci20 = cci(h, l, closes, 20);
  const roc12 = roc(closes, 12);
  const hv20 = historicalVolatility(closes, 20);
  const volRatio = v.length >= 20 ? volumeRatio(v, 20) : null;
  const pos52w = pricePosition52w(closes);

  // ─── Composite Technical Strength Score (0-100) ───
  // Weights approximate the Alpha158 factor importance hierarchy
  let score = 50; // neutral baseline
  const signals: number[] = [];

  // Trend signals (+/- points)
  if (base.sma20 && base.close > base.sma20) signals.push(8); else if (base.sma20) signals.push(-8);
  if (base.sma50 && base.close > base.sma50) signals.push(6); else if (base.sma50) signals.push(-6);
  if (base.ema20 && base.sma50 && base.ema20 > base.sma50) signals.push(5); else if (base.ema20 && base.sma50) signals.push(-5);

  // RSI
  if (base.rsi14 != null) {
    if (base.rsi14 > 70) signals.push(-6); // overbought
    else if (base.rsi14 < 30) signals.push(6); // oversold (contrarian bullish)
    else if (base.rsi14 >= 50 && base.rsi14 <= 65) signals.push(4); // healthy uptrend
    else if (base.rsi14 < 50 && base.rsi14 >= 35) signals.push(-2);
  }

  // MACD
  if (base.macd) {
    if (base.macd.histogram > 0) signals.push(5);
    else signals.push(-5);
  }

  // Bollinger position
  if (base.bollinger) {
    const bPct = (base.close - base.bollinger.lower) / (base.bollinger.upper - base.bollinger.lower);
    if (bPct < 0.1) signals.push(4); // near lower band (mean-reversion bullish)
    else if (bPct > 0.9) signals.push(-4); // near upper band
  }

  // ADX (trend strength)
  if (adx14) {
    if (adx14.adx > 25 && adx14.diPlus > adx14.diMinus) signals.push(6); // strong uptrend
    else if (adx14.adx > 25 && adx14.diMinus > adx14.diPlus) signals.push(-6); // strong downtrend
  }

  // Stochastic
  if (stoch) {
    if (stoch.k < 20) signals.push(3); // oversold
    else if (stoch.k > 80) signals.push(-3); // overbought
    if (stoch.k > stoch.d) signals.push(2); // bullish crossover
    else signals.push(-2);
  }

  // Williams %R
  if (wr14 != null) {
    if (wr14 < -80) signals.push(3); // oversold
    else if (wr14 > -20) signals.push(-3); // overbought
  }

  // Volume confirmation
  if (volRatio != null) {
    if (volRatio > 1.5 && base.priceChange1d && base.priceChange1d > 0) signals.push(5); // volume confirms up
    else if (volRatio > 1.5 && base.priceChange1d && base.priceChange1d < 0) signals.push(-5);
  }

  // ROC momentum
  if (roc12 != null) {
    if (roc12 > 5) signals.push(3);
    else if (roc12 < -5) signals.push(-3);
  }

  // 52-week position
  if (pos52w) {
    if (pos52w.fromHigh > -5) signals.push(3); // near 52w high (momentum)
    else if (pos52w.fromHigh < -30) signals.push(-2); // far from highs
  }

  const totalSignal = signals.reduce((s, v) => s + v, 0);
  score = Math.max(0, Math.min(100, 50 + totalSignal));

  return {
    ...base,
    atr14,
    adx14,
    obv: obvVal,
    vwap20,
    williamsR14: wr14,
    stochastic: stoch,
    cci20,
    roc12,
    historicalVol20: hv20,
    volumeRatio20: volRatio,
    pricePosition52w: pos52w,
    technicalStrength: Math.round(score),
  };
}
