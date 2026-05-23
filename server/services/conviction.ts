/**
 * Calibrated Conviction Scorer — Phase 3
 *
 * Combines multiple data-driven signals into a programmatic conviction score (0-1)
 * that acts as a FLOOR for trading decisions. If programmatic conviction is low,
 * the trade is rejected regardless of what the LLM claims.
 *
 * Uses the `feature_reliability` table (previously dead code) to weight components.
 */
import { db } from '../db/index.js';
import { logger } from '../logger.js';
import type { EnhancedTechnicals } from './technicals.js';

interface ConvictionInput {
  technicalStrength: number; // 0-100 from enhanced technicals
  sentimentScore: number | null; // -1..+1 from FinBERT
  sentimentTrend: 'improving' | 'declining' | 'stable' | null;
  predictionAccuracy: number | null; // 0-1 rolling accuracy for this symbol/strategy
  volumeConfirmation: boolean; // volume above average on move direction
  trendAlignment: boolean; // price above SMA20 + MACD positive
  marketRegime: 'Bullish' | 'Bearish' | 'Sideways';
  side: 'BUY' | 'SELL';
}

interface ConvictionResult {
  score: number; // 0-1 calibrated conviction
  components: {
    technical: number;
    sentiment: number;
    accuracy: number;
    volume: number;
    trend: number;
    regime: number;
  };
  weights: Record<string, number>;
  reason: string;
}

/** Get current feature weights from DB (auto-adjusted over time) */
function getWeights(): Record<string, number> {
  const rows = db.prepare(
    'SELECT feature_name, weight FROM feature_reliability',
  ).all() as Array<{ feature_name: string; weight: number }>;

  const defaults: Record<string, number> = {
    Technical: 0.30,
    Sentiment: 0.20,
    Macro: 0.15,
    Fundamental: 0.15,
    Volume: 0.10,
    Accuracy: 0.10,
  };

  for (const r of rows) {
    defaults[r.feature_name] = r.weight;
  }
  return defaults;
}

/**
 * Compute a calibrated conviction score for a proposed trade.
 * This is NOT a replacement for the LLM's reasoning — it's a programmatic FLOOR.
 * If this returns < threshold, the trade is blocked regardless of LLM conviction.
 */
export function computeConviction(input: ConvictionInput): ConvictionResult {
  const weights = getWeights();

  // 1. Technical component (0-1): direct from technicalStrength (0-100)
  let technicalScore: number;
  if (input.side === 'BUY') {
    technicalScore = input.technicalStrength / 100;
  } else {
    // For SELL, inverted: low technical strength = higher conviction to sell
    technicalScore = 1 - input.technicalStrength / 100;
  }

  // 2. Sentiment component (0-1)
  let sentimentComp = 0.5; // neutral default
  if (input.sentimentScore != null) {
    if (input.side === 'BUY') {
      sentimentComp = (input.sentimentScore + 1) / 2; // map -1..+1 to 0..1
    } else {
      sentimentComp = (1 - input.sentimentScore) / 2; // inverted for sells
    }
    // Trend bonus/penalty
    if (input.sentimentTrend === 'improving' && input.side === 'BUY') sentimentComp = Math.min(1, sentimentComp + 0.1);
    if (input.sentimentTrend === 'declining' && input.side === 'SELL') sentimentComp = Math.min(1, sentimentComp + 0.1);
    if (input.sentimentTrend === 'declining' && input.side === 'BUY') sentimentComp = Math.max(0, sentimentComp - 0.15);
  }

  // 3. Historical accuracy component (0-1)
  let accuracyComp = 0.5; // neutral if no data
  if (input.predictionAccuracy != null) {
    accuracyComp = input.predictionAccuracy;
  }

  // 4. Volume confirmation (0 or 1)
  const volumeComp = input.volumeConfirmation ? 0.8 : 0.3;

  // 5. Trend alignment (0 or 1)
  let trendComp: number;
  if (input.side === 'BUY') {
    trendComp = input.trendAlignment ? 0.85 : 0.25;
  } else {
    trendComp = input.trendAlignment ? 0.25 : 0.85; // misalignment supports sell
  }

  // 6. Market regime modifier
  let regimeComp: number;
  if (input.side === 'BUY') {
    regimeComp = input.marketRegime === 'Bullish' ? 0.8 : input.marketRegime === 'Sideways' ? 0.5 : 0.2;
  } else {
    regimeComp = input.marketRegime === 'Bearish' ? 0.8 : input.marketRegime === 'Sideways' ? 0.5 : 0.3;
  }

  // Weighted combination
  const wTech = weights['Technical'] ?? 0.30;
  const wSent = weights['Sentiment'] ?? 0.20;
  const wAcc = weights['Accuracy'] ?? 0.10;
  const wVol = weights['Volume'] ?? 0.10;
  const wTrend = weights['Macro'] ?? 0.15; // reuse Macro weight for trend alignment
  const wRegime = weights['Fundamental'] ?? 0.15; // reuse Fundamental weight for regime

  const totalWeight = wTech + wSent + wAcc + wVol + wTrend + wRegime;
  const raw = (
    technicalScore * wTech +
    sentimentComp * wSent +
    accuracyComp * wAcc +
    volumeComp * wVol +
    trendComp * wTrend +
    regimeComp * wRegime
  ) / totalWeight;

  // Clamp to 0-1
  const score = Math.max(0, Math.min(1, raw));

  // Build human-readable reason
  const parts: string[] = [];
  if (technicalScore >= 0.6) parts.push('technicals support');
  else if (technicalScore <= 0.3) parts.push('technicals oppose');
  if (sentimentComp >= 0.6) parts.push('sentiment positive');
  else if (sentimentComp <= 0.3) parts.push('sentiment negative');
  if (!input.volumeConfirmation) parts.push('volume not confirming');
  if (input.side === 'BUY' && input.marketRegime === 'Bearish') parts.push('bearish regime penalty');
  if (input.side === 'BUY' && !input.trendAlignment) parts.push('against trend');

  return {
    score,
    components: {
      technical: technicalScore,
      sentiment: sentimentComp,
      accuracy: accuracyComp,
      volume: volumeComp,
      trend: trendComp,
      regime: regimeComp,
    },
    weights: { Technical: wTech, Sentiment: wSent, Accuracy: wAcc, Volume: wVol, Trend: wTrend, Regime: wRegime },
    reason: parts.length ? parts.join('; ') : 'neutral signals',
  };
}

/**
 * Get rolling prediction accuracy for a symbol+strategy combination.
 * Looks at the last N validated predictions.
 */
export function getPredictionAccuracy(symbol: string, strategy?: string, limit = 20): number | null {
  const query = strategy
    ? db.prepare(
        `SELECT result FROM predictions p JOIN stocks s ON p.stock_id = s.id
         WHERE s.symbol = ? AND p.strategy = ? AND p.status = 'VALIDATED'
         ORDER BY p.validated_at DESC LIMIT ?`,
      ).all(symbol, strategy, limit) as Array<{ result: string }>
    : db.prepare(
        `SELECT result FROM predictions p JOIN stocks s ON p.stock_id = s.id
         WHERE s.symbol = ? AND p.status = 'VALIDATED'
         ORDER BY p.validated_at DESC LIMIT ?`,
      ).all(symbol, limit) as Array<{ result: string }>;

  if (query.length < 3) return null; // not enough data to be meaningful

  const accurate = query.filter((r) => r.result === 'ACCURATE').length;
  const partial = query.filter((r) => r.result === 'PARTIAL').length;
  // Partial counts as 0.5
  return (accurate + partial * 0.5) / query.length;
}

/**
 * Update feature reliability weights based on recent prediction outcomes.
 * Called periodically (e.g., weekly) to close the feedback loop.
 */
export function updateFeatureWeights(): void {
  // Get recent validated predictions that have input_snapshot
  const recent = db.prepare(
    `SELECT result, input_snapshot FROM predictions
     WHERE status = 'VALIDATED' AND validated_at >= datetime('now', '-30 days')
     ORDER BY validated_at DESC LIMIT 200`,
  ).all() as Array<{ result: string; input_snapshot: string }>;

  if (recent.length < 20) return; // not enough data

  // Count which features were strong when prediction was accurate vs failed
  let techCorrect = 0, techTotal = 0;
  let sentCorrect = 0, sentTotal = 0;

  for (const r of recent) {
    let snap: any = {};
    try { snap = JSON.parse(r.input_snapshot ?? '{}'); } catch { continue; }
    const isGood = r.result === 'ACCURATE' || r.result === 'PARTIAL';

    // Technical strength signal
    if (snap.technicals?.rsi14 != null) {
      techTotal++;
      if (isGood) techCorrect++;
    }
    // Sentiment signal (if we had it at prediction time)
    if (snap.sentiment_score != null) {
      sentTotal++;
      if (isGood) sentCorrect++;
    }
  }

  // Update weights proportionally to success rate (bounded 0.1-0.5)
  const bound = (v: number) => Math.max(0.1, Math.min(0.5, v));
  if (techTotal > 10) {
    const newWeight = bound(techCorrect / techTotal);
    db.prepare('UPDATE feature_reliability SET weight = ?, success_rate = ?, times_used = ?, success_count = ?, last_updated = CURRENT_TIMESTAMP WHERE feature_name = ?')
      .run(newWeight, techCorrect / techTotal, techTotal, techCorrect, 'Technical');
  }
  if (sentTotal > 10) {
    const newWeight = bound(sentCorrect / sentTotal);
    db.prepare('UPDATE feature_reliability SET weight = ?, success_rate = ?, times_used = ?, success_count = ?, last_updated = CURRENT_TIMESTAMP WHERE feature_name = ?')
      .run(newWeight, sentCorrect / sentTotal, sentTotal, sentCorrect, 'Sentiment');
  }

  logger.info({ recent: recent.length, techTotal, sentTotal }, 'Feature reliability weights updated');
}
