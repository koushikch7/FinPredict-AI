import type { BrokerAdapter } from './types.js';

/**
 * Stub adapters for brokers without an official, stable public API.
 *
 *  - Groww: API is invitation-only; users may upload a CSV export.
 *  - Paytm Money: documented API at developer.paytmmoney.com (OAuth + Bearer token).
 *  - Indstocks: closed API; CSV-only for now.
 *
 * These stubs accept credentials, mark the account "enabled", and let users
 * upload portfolio CSVs via /api/brokers/:name/upload-holdings.
 */
function stub(name: BrokerAdapter['name']): BrokerAdapter {
  return {
    name,
    loginUrl: () => `#${name}-not-implemented`,
    async exchangeToken() {
      throw new Error(`OAuth flow for ${name} is not yet implemented. Use the CSV import on the Brokers page.`);
    },
    async fetchHoldings() {
      throw new Error(`Live holdings sync for ${name} is not available. Use CSV import.`);
    },
  };
}

export const growwAdapter = stub('groww');
export const paytmAdapter = stub('paytm');
export const indstocksAdapter = stub('indstocks');
