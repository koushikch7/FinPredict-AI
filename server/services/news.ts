import axios from 'axios';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { configStore } from './config-store.js';
import { logger } from '../logger.js';
import { scoreUnscoredNews } from './sentiment.js';

interface NewsItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
}

/**
 * Fetches Indian markets news. Tries NewsAPI if a key is configured,
 * else falls back to Google News RSS (works without a key).
 */
export async function fetchMarketNews(symbols: string[] = []): Promise<NewsItem[]> {
  const apiKey = configStore.get('NEWS_API_KEY') || config.NEWS_API_KEY;
  const query = symbols.length ? symbols.join(' OR ') : 'Indian stock market OR NSE OR Sensex OR Nifty';

  if (apiKey) {
    try {
      // API key sent as a header (X-Api-Key) rather than a URL query parameter
      // so it does not appear in server access logs or browser history.
      const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        query,
      )}&language=en&sortBy=publishedAt&pageSize=15`;
      const { data } = await axios.get(url, { timeout: 10_000, headers: { 'X-Api-Key': apiKey } });
      return (data.articles ?? []).map((a: any) => ({
        headline: a.title,
        source: a.source?.name ?? 'NewsAPI',
        url: a.url,
        publishedAt: a.publishedAt,
        summary: a.description,
      }));
    } catch (e: any) {
      logger.warn({ err: e.message }, 'NewsAPI failed, falling back to RSS');
    }
  }

  // Free fallback: Google News RSS
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const { data } = await axios.get<string>(url, { timeout: 10_000, responseType: 'text' });
    const items: NewsItem[] = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m: RegExpExecArray | null;
    while ((m = itemRe.exec(data)) && items.length < 15) {
      const block = m[1];
      const tag = (t: string) => {
        const r = new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${t}>`).exec(block);
        return r?.[1]?.trim() ?? '';
      };
      items.push({
        headline: tag('title'),
        source: tag('source') || 'Google News',
        url: tag('link'),
        publishedAt: new Date(tag('pubDate') || Date.now()).toISOString(),
      });
    }
    return items;
  } catch (e: any) {
    logger.warn({ err: e.message }, 'News RSS failed');
    return [];
  }
}

export function persistNews(items: NewsItem[]) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO news_articles (headline, source, url, published_at, summary)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const tx = db.transaction((arr: NewsItem[]) => {
    for (const n of arr) insert.run(n.headline, n.source, n.url, n.publishedAt, n.summary ?? null);
  });
  tx(items);
  // Fire-and-forget: score new headlines with FinBERT
  scoreUnscoredNews(items.length + 10).catch(() => {});
}

export function recentNews(limit = 20) {
  return db
    .prepare(
      `SELECT id, headline, source, url, published_at, summary, sentiment, sentiment_score
       FROM news_articles ORDER BY published_at DESC LIMIT ?`,
    )
    .all(limit);
}
