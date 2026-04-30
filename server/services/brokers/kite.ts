import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - kiteconnect ships its own typings via .d.ts
import { KiteConnect } from 'kiteconnect';
import type { BrokerAdapter, BrokerHolding } from './types.js';
import { logger } from '../../logger.js';

/**
 * Zerodha Kite Connect v3 adapter.
 *
 * Login flow:
 *   1. User visits /connect/login?v=3&api_key=...   (returned by loginUrl())
 *   2. Zerodha redirects back with ?request_token=...
 *   3. Server posts checksum SHA256(api_key + request_token + api_secret) to /session/token
 *   4. Resulting access_token is valid until next 06:00 IST (we store +24h as a soft expiry).
 */
export const kiteAdapter: BrokerAdapter = {
  name: 'kite',

  loginUrl(apiKey: string) {
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(apiKey)}`;
  },

  async exchangeToken({ apiKey, apiSecret, requestToken }) {
    const checksum = crypto
      .createHash('sha256')
      .update(apiKey + requestToken + apiSecret)
      .digest('hex');
    const body = new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum,
    });
    const r = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Kite-Version': '3',
      },
      body,
    });
    const j = (await r.json()) as any;
    if (!r.ok || j.status !== 'success' || !j.data?.access_token) {
      throw new Error(j.message || `Kite token exchange failed (${r.status})`);
    }
    // Kite tokens expire at 06:00 IST next day; treat 18h as a safe soft expiry
    const expiresAt = new Date(Date.now() + 18 * 60 * 60 * 1000);
    return { accessToken: j.data.access_token, expiresAt, meta: { user_id: j.data.user_id } };
  },

  async fetchHoldings({ apiKey, accessToken }): Promise<BrokerHolding[]> {
    try {
      const kc = new KiteConnect({ api_key: apiKey });
      kc.setAccessToken(accessToken);
      const holdings: any[] = await kc.getHoldings();
      return holdings.map((h: any) => ({
        symbol: h.tradingsymbol,
        exchange: h.exchange,
        quantity: Number(h.quantity ?? 0),
        averagePrice: Number(h.average_price ?? 0),
        lastPrice: Number(h.last_price ?? 0) || undefined,
        pnl: Number(h.pnl ?? 0) || undefined,
      }));
    } catch (e: any) {
      logger.error({ err: e.message }, 'Kite fetchHoldings failed');
      throw e;
    }
  },
};

/**
 * Bulk live LTP fetch via Kite. Returns Map<symbol, lastPrice>.
 * Symbols can be plain (RELIANCE) or exchange-qualified (NSE:RELIANCE).
 *
 * NOTE: Kite's getLTP/quote endpoints require an active market-data
 * subscription on the user's Zerodha account. Without it the API throws
 * `PermissionException: Insufficient permission for that call.` We treat
 * any error as "not available" and let callers fall back to Yahoo.
 */
const kiteLtpDisabledFor = new Set<string>(); // apiKey -> known to be unsubscribed
export async function fetchKiteLTPs(
  apiKey: string,
  accessToken: string,
  items: Array<{ symbol: string; exchange?: string }>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (items.length === 0 || kiteLtpDisabledFor.has(apiKey)) return out;
  try {
    const kc = new KiteConnect({ api_key: apiKey });
    kc.setAccessToken(accessToken);
    const keys = items.map((i) => `${(i.exchange || 'NSE').toUpperCase()}:${i.symbol}`);
    const r: Record<string, any> = await kc.getLTP(keys);
    for (const i of items) {
      const k = `${(i.exchange || 'NSE').toUpperCase()}:${i.symbol}`;
      const px = Number(r?.[k]?.last_price ?? 0);
      if (px > 0) out.set(i.symbol, px);
    }
  } catch (e: any) {
    const msg = String(e?.message || e?.error_type || e || '');
    if (/permission|insufficient|subscription/i.test(msg)) {
      // One-time log — many users don't have Kite market-data subscription.
      kiteLtpDisabledFor.add(apiKey);
      logger.info({ apiKey: apiKey.slice(0, 4) + '…' }, 'Kite live quotes unavailable (no market-data subscription) — using Yahoo');
    } else {
      logger.warn({ err: msg }, 'Kite LTP fetch failed; falling back to Yahoo');
    }
  }
  return out;
}
