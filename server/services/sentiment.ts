/**
 * FinBERT-powered sentiment analysis via HuggingFace Inference API.
 * Scores financial news headlines as positive/neutral/negative with a numeric score.
 * Results are cached in the existing news_articles.sentiment + sentiment_score columns.
 */
import axios from 'axios';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const HF_MODEL = 'ProsusAI/finbert';
const HF_API_URL = `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`;
const BATCH_SIZE = 10; // HF Inference API handles up to ~10 inputs per call efficiently

export interface SentimentResult {
  label: 'positive' | 'neutral' | 'negative';
  score: number; // 0..1, confidence of the predicted label
  sentimentScore: number; // -1..+1 composite: P(positive) - P(negative)
}

/**
 * Score a batch of headlines using FinBERT via HuggingFace Inference API.
 * Returns an array of results (same order as input).
 * On failure (no API key, rate limit, model loading), returns null entries.
 */
export async function scoreHeadlines(headlines: string[]): Promise<(SentimentResult | null)[]> {
  const apiKey = config.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    logger.warn('FinBERT sentiment: no HUGGINGFACE_API_KEY configured');
    return headlines.map(() => null);
  }
  if (headlines.length === 0) return [];

  const results: (SentimentResult | null)[] = new Array(headlines.length).fill(null);

  // Process in batches
  for (let i = 0; i < headlines.length; i += BATCH_SIZE) {
    const batch = headlines.slice(i, i + BATCH_SIZE);
    try {
      const { data } = await axios.post(
        HF_API_URL,
        { inputs: batch, parameters: { top_k: null } },
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          timeout: 30_000,
        },
      );
      // Response: array of arrays, each inner array has [{label, score}, ...] for all 3 classes
      for (let j = 0; j < batch.length; j++) {
        const scores = data[j];
        if (!Array.isArray(scores)) continue;
        // Find P(positive), P(negative), P(neutral)
        let pPos = 0, pNeg = 0, pNeu = 0;
        let topLabel: SentimentResult['label'] = 'neutral';
        let topScore = 0;
        for (const s of scores) {
          if (s.label === 'positive') pPos = s.score;
          else if (s.label === 'negative') pNeg = s.score;
          else if (s.label === 'neutral') pNeu = s.score;
          if (s.score > topScore) {
            topScore = s.score;
            topLabel = s.label;
          }
        }
        results[i + j] = {
          label: topLabel,
          score: topScore,
          sentimentScore: pPos - pNeg, // -1 (very negative) to +1 (very positive)
        };
      }
    } catch (e: any) {
      // Model might be loading (503) — HF wakes cold models on first request
      if (e.response?.status === 503) {
        logger.info('FinBERT model loading on HF — will retry next cycle');
      } else {
        logger.warn({ err: e.message, status: e.response?.status }, 'FinBERT sentiment API error');
      }
    }
  }
  return results;
}

/**
 * Score all un-scored news articles in the DB and persist sentiment.
 * Called by the background scheduler or on-demand during prediction/trading.
 * Returns count of newly scored articles.
 */
export async function scoreUnscoredNews(limit = 100): Promise<number> {
  const unscored = db.prepare(
    `SELECT id, headline FROM news_articles
     WHERE sentiment_score IS NULL AND headline IS NOT NULL
     ORDER BY published_at DESC LIMIT ?`,
  ).all(limit) as Array<{ id: number; headline: string }>;

  if (unscored.length === 0) return 0;

  const headlines = unscored.map((r) => r.headline);
  const results = await scoreHeadlines(headlines);

  const update = db.prepare(
    'UPDATE news_articles SET sentiment = ?, sentiment_score = ? WHERE id = ?',
  );
  let scored = 0;
  const tx = db.transaction(() => {
    for (let i = 0; i < unscored.length; i++) {
      const r = results[i];
      if (r) {
        update.run(r.label, r.sentimentScore, unscored[i].id);
        scored++;
      }
    }
  });
  tx();

  if (scored > 0) {
    logger.info({ scored, total: unscored.length }, 'FinBERT sentiment: scored news articles');
  }
  return scored;
}

/**
 * Get aggregated sentiment for a symbol over recent days.
 * Uses the `symbols` column (LIKE match) + sentiment_score.
 * Returns average score, count, and trend.
 */
export function getSymbolSentiment(symbol: string, days = 7): {
  avgScore: number; // -1..+1
  count: number;
  positive: number;
  negative: number;
  neutral: number;
  trend: 'improving' | 'declining' | 'stable';
} | null {
  const rows = db.prepare(
    `SELECT sentiment, sentiment_score FROM news_articles
     WHERE sentiment_score IS NOT NULL
       AND (headline LIKE ? OR symbols LIKE ?)
       AND published_at >= datetime('now', ?)
     ORDER BY published_at DESC`,
  ).all(`%${symbol}%`, `%${symbol}%`, `-${days} days`) as Array<{ sentiment: string; sentiment_score: number }>;

  if (rows.length === 0) return null;

  const scores = rows.map((r) => r.sentiment_score);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const positive = rows.filter((r) => r.sentiment === 'positive').length;
  const negative = rows.filter((r) => r.sentiment === 'negative').length;
  const neutral = rows.filter((r) => r.sentiment === 'neutral').length;

  // Trend: compare first half to second half
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (scores.length >= 4) {
    const mid = Math.floor(scores.length / 2);
    const recent = scores.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    const older = scores.slice(mid).reduce((s, v) => s + v, 0) / (scores.length - mid);
    if (recent - older > 0.1) trend = 'improving';
    else if (older - recent > 0.1) trend = 'declining';
  }

  return { avgScore: avg, count: rows.length, positive, negative, neutral, trend };
}

/**
 * Get broad market sentiment from recent macro news.
 */
export function getMarketSentiment(days = 3): {
  avgScore: number;
  count: number;
  bullish: boolean;
} {
  const rows = db.prepare(
    `SELECT sentiment_score FROM news_articles
     WHERE sentiment_score IS NOT NULL
       AND published_at >= datetime('now', ?)
     ORDER BY published_at DESC LIMIT 50`,
  ).all(`-${days} days`) as Array<{ sentiment_score: number }>;

  if (rows.length === 0) return { avgScore: 0, count: 0, bullish: false };

  const avg = rows.reduce((s, r) => s + r.sentiment_score, 0) / rows.length;
  return { avgScore: avg, count: rows.length, bullish: avg > 0.05 };
}
