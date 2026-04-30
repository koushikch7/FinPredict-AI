import { db } from '../db/index.js';
import { resolveAIConfig, aiComplete } from './ai.js';
import { fetchYahooQuote } from './prices.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are FinPredict, a senior Indian markets advisor.
- Default region: India (NSE/BSE), default currency INR (₹).
- Be concrete: cite numbers, ratios, and named drivers.
- Always end recommendations with a 1-line risk warning.
- Refuse to give guarantees of returns; emphasise probabilistic thinking.
- When the user mentions an Indian symbol (e.g. RELIANCE, TCS), assume NSE unless told otherwise.`;

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

  // Inject light market context: any uppercase tickers in the message we recognise
  const tickers = Array.from(new Set((content.match(/\b[A-Z]{2,15}\b/g) ?? []))).slice(0, 5);
  let ctxBlock = '';
  if (tickers.length) {
    const quotes = await Promise.all(
      tickers.map(async (t) => {
        const q = await fetchYahooQuote(t, 'NSE');
        return q ? `${t}: ₹${q.price.toFixed(2)} (${q.changePct?.toFixed(2) ?? '?'}%)` : null;
      }),
    );
    const lines = quotes.filter(Boolean) as string[];
    if (lines.length) ctxBlock = `\n\n[Live quotes]\n${lines.join('\n')}`;
  }

  // Portfolio-aware context: if user references "my/portfolio/holding/should i", inject account state
  if (/\b(my|portfolio|holdings?|positions?|should i|shall i|do i)\b/i.test(content)) {
    try {
      const acc = db.prepare('SELECT id, cash, starting_capital FROM paper_accounts WHERE user_id = ?').get(userId) as { id: number; cash: number; starting_capital: number } | undefined;
      if (acc) {
        const positions = db
          .prepare(`SELECT s.symbol, p.quantity, p.average_price FROM paper_positions p JOIN stocks s ON p.stock_id = s.id WHERE p.account_id = ?`)
          .all(acc.id) as Array<{ symbol: string; quantity: number; average_price: number }>;
        const enriched = await Promise.all(
          positions.map(async (p) => {
            const q = await fetchYahooQuote(p.symbol, 'NSE');
            const ltp = q?.price ?? p.average_price;
            const pnlPct = ((ltp - p.average_price) / p.average_price) * 100;
            return `${p.symbol} qty=${p.quantity} avg=₹${p.average_price.toFixed(2)} ltp=₹${ltp.toFixed(2)} pnl=${pnlPct.toFixed(2)}%`;
          }),
        );
        const recentPreds = db
          .prepare(
            `SELECT s.symbol, p.direction, p.confidence, p.expected_move_p, p.horizon, p.created_at
             FROM predictions p JOIN stocks s ON p.stock_id = s.id
             WHERE p.user_id = ? ORDER BY p.created_at DESC LIMIT 5`,
          )
          .all(userId) as Array<{ symbol: string; direction: string; confidence: number; expected_move_p: number; horizon: string; created_at: string }>;
        ctxBlock += `\n\n[User's paper-trading account]\nCash: ₹${acc.cash.toFixed(2)} (start ₹${acc.starting_capital.toFixed(0)})\nPositions:\n${enriched.length ? enriched.join('\n') : '(none)'}`;
        if (recentPreds.length) {
          ctxBlock += `\n\n[Recent AI predictions]\n${recentPreds.map((p) => `${p.symbol} ${p.direction} ${(p.confidence * 100).toFixed(0)}% (${p.expected_move_p.toFixed(2)}% / ${p.horizon})`).join('\n')}`;
        }
      }
    } catch (e) {
      // best-effort context, ignore failures
    }
  }

  const transcript = history
    .map((m) => (m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`))
    .join('\n');
  const prompt = `${transcript}${ctxBlock}\n\nAssistant:`;

  const aiCfg = resolveAIConfig(userId);
  const reply = await aiComplete(aiCfg, { prompt, systemPrompt: SYSTEM_PROMPT, temperature: 0.5, callerTag: 'chat' });
  db.prepare('INSERT INTO chat_messages (session_id, role, content) VALUES (?, ?, ?)').run(sid, 'assistant', reply);
  return { sessionId: sid, reply };
}
