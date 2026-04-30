import { db } from '../../db/index.js';

export type BrokerName = 'kite' | 'groww' | 'paytm' | 'indstocks';

export interface BrokerHolding {
  symbol: string;
  exchange?: string;
  quantity: number;
  averagePrice: number;
  lastPrice?: number;
  pnl?: number;
}

export interface BrokerAdapter {
  name: BrokerName;
  /** Returns the URL the user must visit to authorize this broker. */
  loginUrl(apiKey: string): string;
  /** Exchange the request token / OTP for a long-lived access token. */
  exchangeToken(input: {
    apiKey: string;
    apiSecret: string;
    requestToken: string;
  }): Promise<{ accessToken: string; expiresAt?: Date; meta?: any }>;
  /** Pull current portfolio holdings. */
  fetchHoldings(input: {
    apiKey: string;
    accessToken: string;
  }): Promise<BrokerHolding[]>;
}

export interface BrokerAccountRow {
  id: number;
  user_id: number;
  broker: BrokerName;
  api_key: string | null;
  api_secret: string | null;
  access_token: string | null;
  access_token_expiry: string | null;
  enabled: number;
  meta: string | null;
}

export const brokerStore = {
  list(userId: number): BrokerAccountRow[] {
    return db
      .prepare('SELECT * FROM broker_accounts WHERE user_id = ?')
      .all(userId) as BrokerAccountRow[];
  },
  get(userId: number, broker: BrokerName): BrokerAccountRow | undefined {
    return db
      .prepare('SELECT * FROM broker_accounts WHERE user_id = ? AND broker = ?')
      .get(userId, broker) as BrokerAccountRow | undefined;
  },
  upsert(input: {
    userId: number;
    broker: BrokerName;
    apiKey?: string | null;
    apiSecret?: string | null;
    accessToken?: string | null;
    expiry?: Date | null;
    enabled?: boolean;
    meta?: any;
  }) {
    const existing = brokerStore.get(input.userId, input.broker);
    const meta = input.meta != null ? JSON.stringify(input.meta) : existing?.meta ?? null;
    if (existing) {
      db.prepare(
        `UPDATE broker_accounts SET
           api_key = COALESCE(?, api_key),
           api_secret = COALESCE(?, api_secret),
           access_token = COALESCE(?, access_token),
           access_token_expiry = COALESCE(?, access_token_expiry),
           enabled = COALESCE(?, enabled),
           meta = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND broker = ?`,
      ).run(
        input.apiKey ?? null,
        input.apiSecret ?? null,
        input.accessToken ?? null,
        input.expiry ? input.expiry.toISOString() : null,
        input.enabled == null ? null : input.enabled ? 1 : 0,
        meta,
        input.userId,
        input.broker,
      );
    } else {
      db.prepare(
        `INSERT INTO broker_accounts
          (user_id, broker, api_key, api_secret, access_token, access_token_expiry, enabled, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        input.userId,
        input.broker,
        input.apiKey ?? null,
        input.apiSecret ?? null,
        input.accessToken ?? null,
        input.expiry ? input.expiry.toISOString() : null,
        input.enabled ? 1 : 0,
        meta,
      );
    }
  },
  delete(userId: number, broker: BrokerName) {
    db.prepare('DELETE FROM broker_accounts WHERE user_id = ? AND broker = ?').run(userId, broker);
  },
  hasAnyEnabled(userId: number): boolean {
    const r = db
      .prepare('SELECT COUNT(*) as c FROM broker_accounts WHERE user_id = ? AND enabled = 1 AND access_token IS NOT NULL')
      .get(userId) as { c: number };
    return r.c > 0;
  },
};
