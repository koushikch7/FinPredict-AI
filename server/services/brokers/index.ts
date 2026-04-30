import type { BrokerAdapter, BrokerName } from './types.js';
import { kiteAdapter } from './kite.js';
import { growwAdapter, paytmAdapter, indstocksAdapter } from './stubs.js';

const registry: Record<BrokerName, BrokerAdapter> = {
  kite: kiteAdapter,
  groww: growwAdapter,
  paytm: paytmAdapter,
  indstocks: indstocksAdapter,
};

export function getBroker(name: BrokerName): BrokerAdapter {
  const a = registry[name];
  if (!a) throw new Error(`Unknown broker: ${name}`);
  return a;
}

export const SUPPORTED_BROKERS: BrokerName[] = ['kite', 'groww', 'paytm', 'indstocks'];

export const BROKER_LABELS: Record<BrokerName, string> = {
  kite: 'Zerodha Kite',
  groww: 'Groww',
  paytm: 'Paytm Money',
  indstocks: 'IND Stocks',
};
