import axios from 'axios';
import { db } from '../db/index.js';
import { logger } from '../logger.js';
import { resolveAIConfig, aiComplete, type ResolvedAI } from './ai.js';

export interface IPORow {
  id: number;
  name: string;
  symbol: string | null;
  open_date: string | null;
  close_date: string | null;
  price_band: string | null;
  status: string | null;
  source: string;
  ai_recommendation: string | null;
  ai_rating: number | null;
  ai_risk_level: string | null;
  ai_potential_pct: number | null;
  ai_horizon: string | null;
  ai_summary: string | null;
  ai_strengths: string | null;
  ai_risks: string | null;
  ai_analyst_view: string | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface FetchedIPO {
  name: string;
  symbol?: string;
  open_date?: string;
  close_date?: string;
  price_band?: string;
  status?: string;
  source: string;
}

/** Normalise NSE-style dates ("05-May-2026", "2026-05-05", "2026/05/05") to ISO YYYY-MM-DD. */
function normaliseDate(input: string | undefined | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;
  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // YYYY/MM/DD
  const slash = /^(\d{4})[/](\d{1,2})[/](\d{1,2})$/.exec(s);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`;
  // DD-MMM-YYYY  e.g. 05-May-2026
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m = /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})$/.exec(s);
  if (m) {
    const mm = months[m[2].slice(0, 3).toLowerCase()];
    if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
  }
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // Fallback: try Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** Pull upcoming/active mainboard IPOs from NSE's public listing endpoint. */
async function fetchUpstream(): Promise<FetchedIPO[]> {
  try {
    const url = 'https://www.nseindia.com/api/all-upcoming-issues?category=ipo';
    const { data } = await axios.get(url, {
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0 FinPredict', Accept: 'application/json' },
    });
    const items = Array.isArray(data) ? data : data?.data ?? [];
    return items.map((i: any) => ({
      name: i.companyName || i.symbol || 'Unknown',
      symbol: i.symbol,
      open_date: normaliseDate(i.issueStartDate || i.openDate) ?? undefined,
      close_date: normaliseDate(i.issueEndDate || i.closeDate) ?? undefined,
      price_band: i.priceBand,
      status: i.status,
      source: 'NSE',
    }));
  } catch (e: any) {
    logger.warn({ err: e.message }, 'NSE IPO fetch failed');
    return [];
  }
}

/** Run AI analysis for one IPO and return structured fields. */
export async function analyseIPO(
  ipo: FetchedIPO,
  cfg: ResolvedAI,
): Promise<{
  recommendation: string;
  rating: number;
  risk_level: string;
  potential_pct: number;
  horizon: string;
  summary: string;
  strengths: string[];
  risks: string[];
  analyst_view: string;
}> {
  const prompt = `Analyse this Indian IPO and return STRICT JSON. Use realistic, calibrated numbers.

IPO: ${JSON.stringify(ipo, null, 2)}

JSON shape:
{
  "recommendation": "SUBSCRIBE" | "AVOID" | "NEUTRAL",
  "rating": number,                // 0..5 (half-points allowed) — overall investment quality
  "risk_level": "Low" | "Medium" | "High",
  "potential_pct": number,         // expected listing-day OR 1-month % gain (signed)
  "horizon": "Listing" | "Short-term" | "Long-term",
  "summary": string,               // 2-3 sentence executive summary
  "strengths": string[],           // 3-5 bullets
  "risks": string[],               // 3-5 bullets
  "analyst_view": string           // 1-line consensus from top brokerages, if known
}`;
  const raw = await aiComplete(cfg, { prompt, json: true, temperature: 0.3, timeoutMs: 30_000, callerTag: 'ipo' });
  let j: any = {};
  try { j = JSON.parse(raw); } catch { const m = /\{[\s\S]*\}/.exec(raw); if (m) j = JSON.parse(m[0]); }
  return {
    recommendation: ['SUBSCRIBE', 'AVOID', 'NEUTRAL'].includes(j.recommendation) ? j.recommendation : 'NEUTRAL',
    rating: Math.max(0, Math.min(5, Number(j.rating) || 0)),
    risk_level: ['Low', 'Medium', 'High'].includes(j.risk_level) ? j.risk_level : 'Medium',
    potential_pct: Number(j.potential_pct) || 0,
    horizon: ['Listing', 'Short-term', 'Long-term'].includes(j.horizon) ? j.horizon : 'Short-term',
    summary: typeof j.summary === 'string' ? j.summary : '',
    strengths: Array.isArray(j.strengths) ? j.strengths.map(String) : [],
    risks: Array.isArray(j.risks) ? j.risks.map(String) : [],
    analyst_view: typeof j.analyst_view === 'string' ? j.analyst_view : '',
  };
}

/**
 * Refresh IPO list from upstream and run AI analysis on any new or
 * stale (>24h) entries. Designed to be called on a 12-hour cron.
 */
export async function refreshIPOs(adminUserId: number): Promise<{ fetched: number; analysed: number; errors: number }> {
  const fetched = await fetchUpstream();
  const cfg = resolveAIConfig(adminUserId);

  const upsert = db.prepare(
    `INSERT INTO ipos (name, symbol, open_date, close_date, price_band, status, source)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name, COALESCE(open_date,'')) DO UPDATE SET
       symbol = excluded.symbol,
       close_date = excluded.close_date,
       price_band = excluded.price_band,
       status = excluded.status,
       updated_at = CURRENT_TIMESTAMP`,
  );
  for (const f of fetched) {
    upsert.run(f.name, f.symbol ?? null, f.open_date ?? null, f.close_date ?? null, f.price_band ?? null, f.status ?? null, f.source);
  }

  // Analyse rows missing analysis or older than 24h
  const stale = db.prepare(
    `SELECT * FROM ipos
     WHERE analyzed_at IS NULL OR datetime(analyzed_at) < datetime('now','-24 hours')
     ORDER BY id DESC LIMIT 20`,
  ).all() as IPORow[];

  let analysed = 0;
  let errors = 0;
  for (const row of stale) {
    try {
      const r = await analyseIPO(
        {
          name: row.name,
          symbol: row.symbol ?? undefined,
          open_date: row.open_date ?? undefined,
          close_date: row.close_date ?? undefined,
          price_band: row.price_band ?? undefined,
          status: row.status ?? undefined,
          source: row.source,
        },
        cfg,
      );
      db.prepare(
        `UPDATE ipos SET
           ai_recommendation = ?, ai_rating = ?, ai_risk_level = ?, ai_potential_pct = ?, ai_horizon = ?,
           ai_summary = ?, ai_strengths = ?, ai_risks = ?, ai_analyst_view = ?,
           analyzed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).run(
        r.recommendation, r.rating, r.risk_level, r.potential_pct, r.horizon,
        r.summary, JSON.stringify(r.strengths), JSON.stringify(r.risks), r.analyst_view, row.id,
      );
      analysed++;
    } catch (e: any) {
      errors++;
      logger.warn({ err: e.message, ipo: row.name }, 'IPO analysis failed');
    }
  }
  logger.info({ fetched: fetched.length, analysed, errors }, 'IPO refresh complete');
  return { fetched: fetched.length, analysed, errors };
}

export function listIPOs(): IPORow[] {
  // Show every IPO whose close date is unknown OR in the future / recent past (last 7 days).
  // Falls back to substring match for legacy non-ISO dates that DATE() can't parse.
  return db.prepare(
    `SELECT * FROM ipos
     WHERE close_date IS NULL
        OR close_date = ''
        OR (DATE(close_date) IS NOT NULL AND DATE(close_date) >= DATE('now','-7 day'))
        OR (DATE(close_date) IS NULL AND close_date LIKE '%' || strftime('%Y','now') || '%')
     ORDER BY ai_rating DESC NULLS LAST, COALESCE(open_date, created_at) DESC`,
  ).all() as IPORow[];
}
