import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { brokerStore, type BrokerName, type BrokerAccountRow } from '../services/brokers/types.js';
import { getBroker, SUPPORTED_BROKERS, BROKER_LABELS } from '../services/brokers/index.js';
import { syncBrokerPortfolio, syncAllBrokersForUser } from '../services/portfolio-sync.js';
import { badRequest, notFound } from '../utils/errors.js';
import { config } from '../config.js';

/**
 * Resolve effective broker credentials, falling back to system-wide env
 * defaults (e.g. KITE_API_KEY) when the per-user record doesn't have its
 * own.  This lets a single admin-provided Kite app credential serve every
 * user — they only need to complete the OAuth login flow.
 */
function envCreds(broker: BrokerName): { apiKey: string; apiSecret: string } {
  if (broker === 'kite') {
    return { apiKey: config.KITE_API_KEY ?? '', apiSecret: config.KITE_API_SECRET ?? '' };
  }
  return { apiKey: '', apiSecret: '' };
}
function effectiveCreds(broker: BrokerName, acc?: BrokerAccountRow) {
  const env = envCreds(broker);
  return {
    apiKey: acc?.api_key || env.apiKey,
    apiSecret: acc?.api_secret || env.apiSecret,
    accessToken: acc?.access_token || null,
  };
}

export const brokersRouter = Router();
brokersRouter.use(authenticate);

brokersRouter.get('/', (req, res) => {
  const accounts = brokerStore.list(req.user!.id);
  const decorated = SUPPORTED_BROKERS.map((b) => {
    const acc = accounts.find((a) => a.broker === b);
    const env = envCreds(b);
    const apiKey = acc?.api_key || env.apiKey;
    const apiSecret = acc?.api_secret || env.apiSecret;
    return {
      broker: b,
      label: BROKER_LABELS[b],
      configured: !!apiKey,
      connected: !!acc?.access_token,
      enabled: !!acc?.enabled,
      expiry: acc?.access_token_expiry ?? null,
      hasSecret: !!apiSecret,
      systemDefault: !acc?.api_key && !!env.apiKey,
      // api_key is not a secret — it appears in the public OAuth login URL.
      // Echo it back so the UI can show what's saved without forcing a re-type.
      apiKey: apiKey || null,
      // Mask the secret so users see something is saved without exposing it.
      apiSecretMasked: apiSecret ? `••••${apiSecret.slice(-4)}` : null,
    };
  });
  res.json({ accounts: decorated, hasAnyEnabled: brokerStore.hasAnyEnabled(req.user!.id) });
});

const CredsSchema = z.object({
  broker: z.enum(['kite', 'groww', 'paytm', 'indstocks']),
  api_key: z.string().min(1).optional(),
  api_secret: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

brokersRouter.post(
  '/credentials',
  validate(CredsSchema),
  asyncHandler(async (req, res) => {
    const { broker, api_key, api_secret, enabled } = req.body as z.infer<typeof CredsSchema>;
    brokerStore.upsert({
      userId: req.user!.id,
      broker,
      apiKey: api_key,
      apiSecret: api_secret,
      enabled,
    });
    res.json({ ok: true });
  }),
);

brokersRouter.get(
  '/:broker/login-url',
  asyncHandler(async (req, res) => {
    const broker = req.params.broker as BrokerName;
    const acc = brokerStore.get(req.user!.id, broker);
    const { apiKey } = effectiveCreds(broker, acc);
    if (!apiKey) throw badRequest('API key not configured for this broker');
    const adapter = getBroker(broker);
    res.json({ url: adapter.loginUrl(apiKey) });
  }),
);

const ExchangeSchema = z.object({
  request_token: z.string().min(1),
});

brokersRouter.post(
  '/:broker/exchange-token',
  validate(ExchangeSchema),
  asyncHandler(async (req, res) => {
    const broker = req.params.broker as BrokerName;
    const acc = brokerStore.get(req.user!.id, broker);
    const { apiKey, apiSecret } = effectiveCreds(broker, acc);
    if (!apiKey || !apiSecret) throw badRequest('API key & secret must be saved first');
    const adapter = getBroker(broker);
    const out = await adapter.exchangeToken({
      apiKey,
      apiSecret,
      requestToken: (req.body as any).request_token,
    });
    brokerStore.upsert({
      userId: req.user!.id,
      broker,
      accessToken: out.accessToken,
      expiry: out.expiresAt,
      enabled: true,
      meta: out.meta,
    });
    res.json({ ok: true, expiry: out.expiresAt });
  }),
);

brokersRouter.post(
  '/:broker/sync',
  asyncHandler(async (req, res) => {
    const broker = req.params.broker as BrokerName;
    let acc = brokerStore.get(req.user!.id, broker);
    const env = envCreds(broker);
    // If no per-user record but env has system default, materialise an in-memory row
    // so portfolio-sync can run pre-flight checks with consistent error messages.
    if (!acc && env.apiKey) {
      acc = {
        id: 0,
        user_id: req.user!.id,
        broker,
        api_key: env.apiKey,
        api_secret: env.apiSecret,
        access_token: null,
        access_token_expiry: null,
        enabled: 1,
        meta: null,
      } as BrokerAccountRow;
    }
    if (!acc) throw notFound('Broker not configured');
    // Patch acc with env fallback for missing fields so syncBrokerPortfolio sees the right key
    if (!acc.api_key && env.apiKey) acc = { ...acc, api_key: env.apiKey };
    if (!acc.api_secret && env.apiSecret) acc = { ...acc, api_secret: env.apiSecret };
    const r = await syncBrokerPortfolio(acc);
    res.json(r);
  }),
);

brokersRouter.post(
  '/sync-all',
  asyncHandler(async (req, res) => {
    const r = await syncAllBrokersForUser(req.user!.id);
    res.json({ results: r });
  }),
);

brokersRouter.delete(
  '/:broker',
  asyncHandler(async (req, res) => {
    brokerStore.delete(req.user!.id, req.params.broker as BrokerName);
    res.json({ ok: true });
  }),
);
