import { db } from '../db/index.js';
import { brokerStore, type BrokerAccountRow } from './brokers/types.js';
import { getBroker } from './brokers/index.js';
import { logger } from '../logger.js';
import { badRequest, unauthorized, HttpError } from '../utils/errors.js';

/**
 * Surface a friendly, actionable error.  Kite tokens expire daily ~07:30 IST and
 * the kiteconnect SDK throws `TokenException` / 403 in that case.  We translate
 * those into a clear "please re-login" hint so the UI can guide the user.
 */
function friendlyBrokerError(broker: string, err: any): Error {
  const msg = String(err?.message ?? err ?? '');
  if (/token.?expired|TokenException|api_key.*incorrect|incorrect.*api_key|incorrect.*access_token|invalid.?token|403/i.test(msg)) {
    return unauthorized(
      `${broker.toUpperCase()} session expired or invalid — please click "Login with ${broker}" again to refresh the access token.`,
    );
  }
  if (/network|ENOTFOUND|ECONN|timeout/i.test(msg)) {
    return new HttpError(502, `${broker.toUpperCase()} unreachable: ${msg}`);
  }
  return err instanceof Error ? err : new Error(msg);
}

export async function syncBrokerPortfolio(account: BrokerAccountRow): Promise<{ count: number }> {
  if (!account.api_key) throw badRequest(`Broker ${account.broker}: API key not configured. Save credentials first.`);
  if (!account.access_token)
    throw badRequest(`Broker ${account.broker}: not logged in yet. Click "Login with ${account.broker}" to authorise.`);
  if (!account.enabled)
    throw badRequest(`Broker ${account.broker}: disabled. Enable it on the Brokers page.`);

  // Pre-flight expiry check — cheaper than a 403 round-trip.
  if (account.access_token_expiry) {
    const exp = new Date(account.access_token_expiry).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      throw unauthorized(
        `${account.broker.toUpperCase()} access token expired on ${account.access_token_expiry} — please re-login.`,
      );
    }
  }

  const adapter = getBroker(account.broker);
  let holdings;
  try {
    holdings = await adapter.fetchHoldings({
      apiKey: account.api_key,
      accessToken: account.access_token,
    });
  } catch (e: any) {
    const friendly = friendlyBrokerError(account.broker, e);
    db.prepare(
      'INSERT INTO sync_logs (user_id, service, status, message) VALUES (?, ?, ?, ?)',
    ).run(account.user_id, account.broker, 'FAILED', friendly.message);
    throw friendly;
  }

  const tx = db.transaction(() => {
    const findStock = db.prepare('SELECT id FROM stocks WHERE symbol = ?');
    const insertStock = db.prepare(
      'INSERT INTO stocks (symbol, name, sector, exchange) VALUES (?, ?, ?, ?)',
    );
    const upsertPos = db.prepare(`
      INSERT INTO portfolio (user_id, stock_id, quantity, average_price, source, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, stock_id) DO UPDATE SET
        quantity = excluded.quantity,
        average_price = excluded.average_price,
        source = excluded.source,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const h of holdings) {
      let row = findStock.get(h.symbol) as { id: number } | undefined;
      if (!row) {
        const info = insertStock.run(h.symbol, h.symbol, 'Unknown', h.exchange ?? 'NSE');
        row = { id: Number(info.lastInsertRowid) };
      }
      upsertPos.run(account.user_id, row.id, h.quantity, h.averagePrice, account.broker);
    }
  });
  tx();

  db.prepare(
    'INSERT INTO sync_logs (user_id, service, status, message) VALUES (?, ?, ?, ?)',
  ).run(account.user_id, account.broker, 'SUCCESS', `Synced ${holdings.length} holdings`);

  logger.info({ user: account.user_id, broker: account.broker, count: holdings.length }, 'Portfolio synced');
  return { count: holdings.length };
}

export async function syncAllBrokersForUser(userId: number) {
  const accounts = brokerStore.list(userId).filter((a) => a.enabled && a.access_token);
  const results: Array<{ broker: string; count: number; error?: string }> = [];
  for (const a of accounts) {
    try {
      const r = await syncBrokerPortfolio(a);
      results.push({ broker: a.broker, count: r.count });
    } catch (e: any) {
      results.push({ broker: a.broker, count: 0, error: e.message });
    }
  }
  return results;
}
