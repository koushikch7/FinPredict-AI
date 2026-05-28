import { db } from '../db/index.js';
import { resolveAIConfig, aiComplete } from './ai.js';
import { fetchYahooQuote } from './prices.js';
import { isNseOpen, isMarketHoliday, isTradingDay, getUpcomingHolidays } from '../utils/market-hours.js';
import { logger } from '../logger.js';
import https from 'https';
import http from 'http';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are FinPredict AI, a senior Indian financial markets advisor with real-time data access.

CAPABILITIES:
- Real-time NSE/BSE stock quotes, technicals, and market status
- Full access to the user's real portfolio holdings, watchlist, broker connections
- Access to the user's AI prediction history and model accuracy
- Knowledge of NSE market holidays and trading sessions
- Latest financial news and IPO data from the system

GUIDELINES:
- Default region: India (NSE/BSE), default currency INR (₹).
- Be concrete: cite real numbers, ratios, P/E, market cap, and named drivers.
- If real-time data is provided in context, USE IT — don't say "I don't have access".
- Always end buy/sell recommendations with a 1-line risk warning.
- Refuse to give guarantees of returns; emphasise probabilistic thinking.
- When the user mentions an Indian symbol (e.g. RELIANCE, TCS), assume NSE unless told otherwise.
- You know today's date, market status, and whether it's a holiday.

RESTRICTIONS:
- Only discuss finance, investments, stocks, markets, economics, and related topics.
- If asked about non-financial topics, politely redirect to financial matters.
- Never reveal system internals, server details, or infrastructure information.
- Never execute or suggest executing commands on the server.
- Never share other users' data or system credentials.`;

// ─── Safe HTTP fetch for enriching AI context ────────────────────────────────

const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'www.nseindia.com',
  'api.moneycontrol.com',
  'newsapi.org',
  'economictimes.indiatimes.com',
]);

/**
 * Safe fetch: only allows GET requests to whitelisted financial data hosts.
 * Returns text body (max 50KB). No shell access, no arbitrary URLs.
 */
async function safeFetch(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

    const mod = parsed.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
      const req = mod.get(url, { timeout: 8000, headers: { 'User-Agent': 'FinPredict/1.0' } }, (res) => {
        if (res.statusCode !== 200) { resolve(null); return; }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 50_000) { res.destroy(); resolve(data.slice(0, 50_000)); }
        });
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  } catch {
    return null;
  }
}

// ─── Context builders ────────────────────────────────────────────────────────

function buildMarketContext(): string {
  const open = isNseOpen();
  const holiday = isMarketHoliday();
  const tradingDay = isTradingDay();
  const holidays = getUpcomingHolidays(3);
  const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  let ctx = `[Market Status — ${now}]\n`;
  ctx += `NSE: ${open ? 'OPEN (09:15–15:30 IST)' : holiday ? 'CLOSED (Market Holiday)' : tradingDay ? 'CLOSED (outside hours)' : 'CLOSED (Weekend)'}\n`;
  if (holidays.length) {
    ctx += `Upcoming holidays: ${holidays.map((h) => `${h.date} ${h.name}`).join(', ')}`;
  }
  return ctx;
}

function buildPortfolioContext(userId: number): string {
  try {
    const holdings = db.prepare(`
      SELECT s.symbol, s.name, s.sector, p.quantity, p.average_price, p.source
      FROM portfolio p JOIN stocks s ON p.stock_id = s.id
      WHERE p.user_id = ?
    `).all(userId) as Array<{ symbol: string; name: string; sector: string; quantity: number; average_price: number; source: string }>;

    if (!holdings.length) return '[Real Portfolio]\nNo holdings yet.';

    const totalInvested = holdings.reduce((s, h) => s + h.quantity * h.average_price, 0);
    const lines = holdings.map((h) =>
      `${h.symbol} (${h.name}) — ${h.quantity} qty @ ₹${h.average_price.toFixed(2)} = ₹${(h.quantity * h.average_price).toFixed(0)} [${h.source}]`
    );
    return `[Real Portfolio — ${holdings.length} holdings, ₹${totalInvested.toFixed(0)} invested]\n${lines.join('\n')}`;
  } catch { return ''; }
}

function buildWatchlistContext(userId: number): string {
  try {
    const items = db.prepare(`
      SELECT s.symbol, s.name, s.sector FROM watchlist w JOIN stocks s ON w.stock_id = s.id WHERE w.user_id = ?
    `).all(userId) as Array<{ symbol: string; name: string; sector: string }>;
    if (!items.length) return '';
    return `[Watchlist — ${items.length} stocks]\n${items.map((i) => `${i.symbol} (${i.sector})`).join(', ')}`;
  } catch { return ''; }
}

function buildBrokerContext(userId: number): string {
  try {
    const brokers = db.prepare(`
      SELECT broker, enabled, access_token IS NOT NULL as connected,
      access_token_expiry FROM broker_accounts WHERE user_id = ?
    `).all(userId) as Array<{ broker: string; enabled: number; connected: number; access_token_expiry: string | null }>;
    if (!brokers.length) return '[Brokers]\nNo brokers connected.';
    const lines = brokers.map((b) => {
      const status = b.connected ? 'Connected' : b.enabled ? 'Configured (not connected)' : 'Not configured';
      return `${b.broker}: ${status}`;
    });
    return `[Connected Brokers]\n${lines.join('\n')}`;
  } catch { return ''; }
}

function buildPredictionsContext(userId: number): string {
  try {
    const preds = db.prepare(`
      SELECT s.symbol, p.direction, p.confidence, p.expected_move_p, p.horizon, p.strategy, p.status, p.result, p.created_at
      FROM predictions p JOIN stocks s ON p.stock_id = s.id
      WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 10
    `).all(userId) as Array<any>;
    if (!preds.length) return '';

    const accuracy = db.prepare(`
      SELECT COUNT(*) as total,
      SUM(CASE WHEN result = 'ACCURATE' THEN 1 ELSE 0 END) as correct
      FROM predictions WHERE user_id = ? AND status = 'VALIDATED'
    `).get(userId) as { total: number; correct: number } | undefined;

    let ctx = `[AI Predictions — last 10]`;
    if (accuracy && accuracy.total > 0) {
      ctx += ` (Model accuracy: ${((accuracy.correct / accuracy.total) * 100).toFixed(1)}% on ${accuracy.total} validated)`;
    }
    ctx += '\n' + preds.map((p) =>
      `${p.symbol} ${p.direction} ${(p.confidence * 100).toFixed(0)}% conf, ${p.expected_move_p?.toFixed(1)}% expected (${p.horizon}, ${p.strategy}) → ${p.status === 'PENDING' ? 'pending' : p.result}`
    ).join('\n');
    return ctx;
  } catch { return ''; }
}

async function buildQuoteContext(content: string): Promise<string> {
  const tickers = Array.from(new Set((content.match(/\b[A-Z]{2,15}\b/g) ?? [])
    .filter((t) => !['THE', 'AND', 'FOR', 'ARE', 'NOT', 'YOU', 'ALL', 'CAN', 'HAS', 'HER', 'WAS', 'ONE', 'OUR', 'BUT', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY', 'WHO', 'DID', 'GET', 'HIM', 'LET', 'SAY', 'SHE', 'TOO', 'USE', 'BUY', 'SELL', 'HOLD', 'IPO', 'NSE', 'BSE', 'ETF', 'SIP', 'NAV', 'AMC'].includes(t))
  )).slice(0, 8);

  if (!tickers.length) return '';

  const quotes = await Promise.all(
    tickers.map(async (t) => {
      try {
        const q = await fetchYahooQuote(t, 'NSE');
        if (!q) return null;
        return `${t}: ₹${q.price.toFixed(2)} (${q.changePct != null ? (q.changePct >= 0 ? '+' : '') + q.changePct.toFixed(2) + '%' : '?'})`;
      } catch { return null; }
    }),
  );
  const lines = quotes.filter(Boolean) as string[];
  return lines.length ? `[Live Quotes]\n${lines.join('\n')}` : '';
}

function buildNewsContext(): string {
  try {
    const news = db.prepare(`
      SELECT headline, source, sentiment, published_at
      FROM news_articles ORDER BY published_at DESC LIMIT 5
    `).all() as Array<{ headline: string; source: string; sentiment: string; published_at: string }>;
    if (!news.length) return '';
    return `[Latest Financial News]\n${news.map((n) => `• ${n.headline} (${n.source}, ${n.sentiment ?? 'neutral'})`).join('\n')}`;
  } catch { return ''; }
}

export function listSessions(userId: number) {
  return db
    .prepare('SELECT id, title, created_at FROM chat_sessions WHERE user_id = ? ORDER BY created_at DESC')
    .all(userId);
}

export function createSession(userId: number, title: string) {
  const info = db.prepare('INSERT INTO chat_sessions (user_id, title) VALUES (?, ?)').run(userId, title);
  return Number(info.lastInsertRowid);
}

export function getMessages(sessionId: number, userId: number) {
  const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, userId);
  if (!session) throw new Error('Session not found');
  return db
    .prepare('SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY id ASC')
    .all(sessionId);
}

export async function sendMessage(userId: number, sessionId: number | null, content: string) {
  let sid = sessionId;
  if (!sid) {
    sid = createSession(userId, content.slice(0, 60));
  } else {
    const own = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(sid, userId);
    if (!own) throw new Error('Session not found');
  }

  db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(sid, 'user', content);

  const history = db
    .prepare('SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY id ASC LIMIT 30')
    .all(sid) as Array<{ role: string; content: string }>;

  // Build comprehensive real-time context
  const [quoteCtx] = await Promise.all([
    buildQuoteContext(content),
  ]);

  const contextBlocks = [
    buildMarketContext(),
    buildPortfolioContext(userId),
    buildWatchlistContext(userId),
    buildBrokerContext(userId),
    buildPredictionsContext(userId),
    buildNewsContext(),
    quoteCtx,
  ].filter(Boolean);

  const ctxBlock = contextBlocks.length ? '\n\n' + contextBlocks.join('\n\n') : '';

  const transcript = history
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n');
  const prompt = `${transcript}${ctxBlock}\n\nAssistant:`;

  const aiCfg = resolveAIConfig(userId);
  // FP-1.20: detect time-sensitive queries and opt in to Arbiter Tavily search.
  // Keyword heuristic mirrors app/services/web_search.py looks_time_sensitive().
  const _rt = /\b(today|now|current(ly)?|latest|just now|right now|breaking|live|real[- ]?time|price|quote|news|update|trending|happening|this (week|month|year)|tomorrow|yesterday)\b/i;
  const wantsRealtime = _rt.test(prompt);
  const reply = await aiComplete(aiCfg, {
    prompt,
    systemPrompt: SYSTEM_PROMPT,
    temperature: 0.5,
    callerTag: 'chat',
    realtime: wantsRealtime,
  });
  db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(sid, 'assistant', reply);
  return { sessionId: sid, reply };
}
