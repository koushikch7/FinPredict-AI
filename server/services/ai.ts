import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { config } from '../config.js';
import { configStore, userSettings } from './config-store.js';
import { logger } from '../logger.js';

export type AIProvider = 'Gemini' | 'OpenAI' | 'Arbiter';

export interface ResolvedAI {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseURL?: string;
  source: 'user' | 'global' | 'env';
}

/**
 * Resolves the AI configuration for a request.
 * Priority: per-user override → DB global → environment defaults.
 */
export function resolveAIConfig(userId?: number): ResolvedAI {
  if (userId) {
    const us = userSettings.all(userId);
    if (us.AI_PROVIDER && us.AI_API_KEY) {
      return {
        provider: us.AI_PROVIDER as AIProvider,
        apiKey: us.AI_API_KEY,
        model: us.AI_MODEL || defaultModelFor(us.AI_PROVIDER as AIProvider),
        baseURL: us.AI_BASE_URL || defaultBaseURLFor(us.AI_PROVIDER as AIProvider),
        source: 'user',
      };
    }
  }

  const provider = (configStore.get('DEFAULT_AI_PROVIDER') as AIProvider) || config.DEFAULT_AI_PROVIDER;
  const dbKey = configStore.get(envKeyName(provider));
  const dbModel = configStore.get('DEFAULT_AI_MODEL');

  const apiKey = dbKey || envKeyValue(provider);
  const model = dbModel || defaultModelFor(provider);
  const baseURL = defaultBaseURLFor(provider);

  return {
    provider,
    apiKey: apiKey || '',
    model,
    baseURL,
    source: dbKey ? 'global' : 'env',
  };
}

function defaultModelFor(p: AIProvider): string {
  if (p === 'OpenAI') return config.OPENAI_MODEL;
  if (p === 'Arbiter') return config.ARBITER_MODEL;
  return config.DEFAULT_AI_MODEL;
}
function defaultBaseURLFor(p: AIProvider): string | undefined {
  if (p === 'OpenAI') return config.OPENAI_BASE_URL;
  if (p === 'Arbiter') return config.ARBITER_BASE_URL;
  return undefined;
}
function envKeyName(p: AIProvider): string {
  if (p === 'OpenAI') return 'OPENAI_API_KEY';
  if (p === 'Arbiter') return 'ARBITER_API_KEY';
  return 'GEMINI_API_KEY';
}
function envKeyValue(p: AIProvider): string {
  if (p === 'OpenAI') return config.OPENAI_API_KEY;
  if (p === 'Arbiter') return config.ARBITER_API_KEY;
  return config.GEMINI_API_KEY;
}

/**
 * Map our internal caller tag to an Arbiter v1.12+ `arbiter_intent` hint.
 * The intent biases auto-routing toward providers/models best suited for
 * the workload (e.g. fast small models for quick scans, reasoning-heavy
 * models for trade decisions).
 */
function arbiterIntentFor(tag?: string): string {
  switch (tag) {
    case 'predictions':
    case 'paper-trader':
    case 'ipo':
      return 'reasoning';
    case 'chat':
      return 'balanced';
    case 'discovery':
    case 'healthcheck':
    default:
      return 'fast';
  }
}

/**
 * `priority` biases the auto-router's scoring: 'speed' favours latency,
 * 'quality' favours capability, 'balanced' is the default trade-off.
 */
function arbiterPriorityFor(tag?: string): 'speed' | 'quality' | 'balanced' {
  switch (tag) {
    case 'predictions':
    case 'paper-trader':
    case 'ipo':
      return 'quality';
    case 'discovery':
    case 'healthcheck':
      return 'speed';
    case 'chat':
    default:
      return 'balanced';
  }
}

/**
 * Build an ordered list of fallback providers to try when the primary fails.
 * Order: whatever providers are configured (have an API key), in the canonical
 * preference Arbiter → OpenAI → Gemini, **excluding the primary itself**.
 *
 * This means:
 *   - If primary is Arbiter and it goes down, we'll try OpenAI then Gemini.
 *   - If primary is Gemini (legacy installs), we still fall back to Arbiter first.
 *   - Returns [] when AI_FALLBACK_ENABLED=false or no other key is set.
 */
function resolveFallbackChain(primary: ResolvedAI): ResolvedAI[] {
  if (!config.AI_FALLBACK_ENABLED) return [];
  const chain: ResolvedAI[] = [];

  const arbKey = configStore.get('ARBITER_API_KEY') || config.ARBITER_API_KEY;
  if (arbKey && primary.provider !== 'Arbiter') {
    chain.push({
      provider: 'Arbiter',
      apiKey: arbKey,
      model: configStore.get('ARBITER_MODEL') || config.ARBITER_MODEL,
      baseURL: configStore.get('ARBITER_BASE_URL') || config.ARBITER_BASE_URL,
      source: 'env',
    });
  }
  const oaKey = configStore.get('OPENAI_API_KEY') || config.OPENAI_API_KEY;
  if (oaKey && primary.provider !== 'OpenAI') {
    chain.push({
      provider: 'OpenAI',
      apiKey: oaKey,
      model: configStore.get('OPENAI_MODEL') || config.OPENAI_MODEL,
      baseURL: configStore.get('OPENAI_BASE_URL') || config.OPENAI_BASE_URL,
      source: 'env',
    });
  }
  const gemKey = configStore.get('GEMINI_API_KEY') || config.GEMINI_API_KEY;
  if (gemKey && primary.provider !== 'Gemini') {
    // 'auto' is only valid for Arbiter/OpenAI gateway routing, not for the Gemini SDK directly.
    const configModel = configStore.get('DEFAULT_AI_MODEL') || config.DEFAULT_AI_MODEL;
    const geminiModel = (!configModel || configModel === 'auto') ? 'gemini-2.5-flash' : configModel;
    chain.push({
      provider: 'Gemini',
      apiKey: gemKey,
      model: geminiModel,
      source: 'env',
    });
  }
  return chain;
}

/**
 * Decide whether an error should trigger a fallback attempt. We're permissive
 * here: quota, timeouts, 5xx, network and Cloudflare block errors all warrant
 * trying the next provider rather than failing the user-visible request.
 */
function shouldFallback(err: any): boolean {
  const msg = String(err?.message ?? err ?? '');
  const status = Number(err?.status ?? err?.code ?? 0);
  if (/429|RESOURCE_EXHAUSTED|rate.?limit|quota|too many requests/i.test(msg)) return true;
  if (/timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network/i.test(msg)) return true;
  if (status >= 500 && status < 600) return true;
  if (/\b(5\d{2})\b/.test(msg)) return true;            // "503 Service Unavailable" in body
  if (/cloudflare|blocked|forbidden/i.test(msg) && status !== 401) return true;
  return false;
}

interface CallOpts {
  prompt: string;
  json?: boolean;
  systemPrompt?: string;
  timeoutMs?: number;
  temperature?: number;
  /** Tag for logs/metrics, e.g. 'discovery', 'predictions', 'paper-trader'. */
  callerTag?: string;
  /** v1.20: opt in to Arbiter X-Arbiter-Realtime: true (Tavily web search). */
  realtime?: boolean;
  /** v1.20: hint Arbiter to bias toward a provider for this call. */
  preferProvider?: string;
  /** v1.20: providers to deprioritise (e.g. pollinations for strict JSON). */
  avoidProviders?: string[];
  /** v1.20.1: strict JSON-schema mode (overrides .json when set). */
  responseSchema?: Record<string, unknown>;
}

/** In-memory ring buffer of the most-recent AI calls (newest last). */
export interface AICallRecord {
  ts: string;
  provider: AIProvider;
  model: string;
  source: string;
  caller: string;
  ms: number;
  ok: boolean;
  fallback?: { provider: AIProvider; model: string };
  error?: string;
  upstreamModel?: string;   // model id reported in the response (Arbiter routes to e.g. gemini-2.5-flash-lite)
  promptChars?: number;
  responseChars?: number;
  /** v1.20: complexity tier surfaced by Arbiter (TRIVIAL..EXPERT). */
  routedComplexity?: string;
  /** v1.20: actual provider Arbiter dispatched to (may differ from request.provider). */
  routedProvider?: string;
  /** v1.20: how many Tavily sources were used to ground this response. */
  realtimeSources?: number;
}
const recentCalls: AICallRecord[] = [];
function pushCall(rec: AICallRecord) {
  recentCalls.push(rec);
  if (recentCalls.length > 100) recentCalls.shift();
}
export function getRecentAICalls(): AICallRecord[] {
  return [...recentCalls].reverse(); // newest first
}

/** Provider-agnostic completion. Always returns a string. */
export async function aiComplete(cfg: ResolvedAI, opts: CallOpts): Promise<string> {
  if (!cfg.apiKey) throw new Error('AI API key is not configured');
  const timeoutMs = opts.timeoutMs ?? 30_000;

  const cleanJSON = (raw: string) => {
    if (!opts.json) return raw;
    let s = raw.trim();
    if (s.startsWith('```')) s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    return s;
  };

  const callOpenAICompatible = async (c: ResolvedAI): Promise<{ text: string; upstreamModel?: string; complexity?: string; routedProvider?: string; realtimeSources?: string[] }> => {
    // Some upstream gateways (e.g. Arbiter behind Cloudflare) flag the default
    // `OpenAI/NodeJS` User-Agent as a bot.  Send a neutral UA + identifying header
    // so the WAF lets the request through.
    const defaultHeaders: Record<string, string> = {
      'User-Agent': 'FinPredict-AI/1.6 (+https://finpredict.chkoushik.com)',
    };
    // FP-1.20: opt in to Arbiter real-time web search via Tavily when caller requests it.
    if (c.provider === 'Arbiter' && opts.realtime) {
      defaultHeaders['X-Arbiter-Realtime'] = 'true';
    }
    const client = new OpenAI({ apiKey: c.apiKey, baseURL: c.baseURL, defaultHeaders });

    // Arbiter v1.12+ routing hints. Safe to send to other OpenAI-compatible
    // gateways since `additionalProperties: true` — vanilla OpenAI ignores
    // unknown fields. We only add them when targeting Arbiter to keep wire
    // payloads minimal everywhere else.
    const arbiterExtras: Record<string, unknown> = {};
    if (c.provider === 'Arbiter') {
      const md: Record<string, unknown> = {
        arbiter_intent: arbiterIntentFor(opts.callerTag),
        priority: arbiterPriorityFor(opts.callerTag),
      };
      // FP-1.20: per-call provider preferences (Discovery prefers strict-JSON providers,
      // avoids weak ones; chat/IPO can opt into realtime web search).
      if (opts.preferProvider) md.prefer_provider = opts.preferProvider;
      if (opts.avoidProviders && opts.avoidProviders.length) md.avoid_providers = opts.avoidProviders;
      if (opts.realtime) md.realtime = true;
      arbiterExtras.metadata = md;
      // Let the gateway pick a capability-matched alternate model when our
      // pinned model fails. Cheaper + faster than a full SDK-level retry.
      arbiterExtras.fallback = 'chain';
    }

    const resp = await client.chat.completions.create({
      model: c.model,
      temperature: opts.temperature ?? 0.3,
      response_format: opts.responseSchema
        ? { type: 'json_schema', json_schema: opts.responseSchema as any }
        : (opts.json ? { type: 'json_object' } : undefined),
      messages: [
        ...(opts.systemPrompt ? [{ role: 'system' as const, content: opts.systemPrompt }] : []),
        { role: 'user', content: opts.prompt },
      ],
      ...arbiterExtras,
    } as Parameters<typeof client.chat.completions.create>[0]);
    const resp2 = resp as any;
    const xArb = resp2.x_arbiter || {};
    return {
      text: cleanJSON(resp2.choices?.[0]?.message?.content ?? ''),
      upstreamModel: resp2.model,
      complexity: xArb.complexity,
      routedProvider: xArb.provider,
      realtimeSources: xArb.realtime_sources,
    };
  };

  const callGemini = async (c: ResolvedAI): Promise<{ text: string; upstreamModel?: string; complexity?: string; routedProvider?: string; realtimeSources?: string[] }> => {
    const ai = new GoogleGenAI({ apiKey: c.apiKey });
    const res: any = await ai.models.generateContent({
      model: c.model,
      contents: opts.systemPrompt ? `${opts.systemPrompt}\n\n${opts.prompt}` : opts.prompt,
      config: opts.json ? { responseMimeType: 'application/json' } : undefined,
    });
    return { text: cleanJSON(res.text || ''), upstreamModel: c.model, complexity: undefined, routedProvider: c.provider, realtimeSources: undefined };
  };

  const runOnce = (c: ResolvedAI) =>
    c.provider === 'Gemini' ? callGemini(c) : callOpenAICompatible(c);

  const withTimeout = <T,>(p: Promise<T>) =>
    Promise.race<T>([
      p,
      new Promise<T>((_, rej) => setTimeout(() => rej(new Error('AI request timed out')), timeoutMs)),
    ]);

  const tag = opts.callerTag ?? 'unknown';
  const start = Date.now();
  try {
    const r = await withTimeout(runOnce(cfg));
    const ms = Date.now() - start;
    logger.info(
      { ai: 'call', provider: cfg.provider, model: cfg.model, upstreamModel: r.upstreamModel, routedComplexity: r.complexity, routedProvider: r.routedProvider, realtimeSources: (r.realtimeSources || []).length, source: cfg.source, caller: tag, ms, chars: r.text.length },
      `AI ok → ${cfg.provider}/${cfg.model}${r.upstreamModel && r.upstreamModel !== cfg.model ? ` (routed: ${r.upstreamModel})` : ''} • ${ms}ms • ${tag}`,
    );
    pushCall({
      ts: new Date().toISOString(),
      provider: cfg.provider,
      model: cfg.model,
      source: cfg.source,
      caller: tag,
      ms,
      ok: true,
      upstreamModel: r.upstreamModel, routedComplexity: r.complexity, routedProvider: r.routedProvider, realtimeSources: (r.realtimeSources || []).length,
      promptChars: (opts.systemPrompt?.length ?? 0) + opts.prompt.length,
      responseChars: r.text.length,
    });
    return r.text;
  } catch (e: any) {
    const ms = Date.now() - start;
    const chain = resolveFallbackChain(cfg);
    if (chain.length && shouldFallback(e)) {
      logger.warn(
        { ai: 'fallback_start', primary: `${cfg.provider}/${cfg.model}`, chain: chain.map((c) => `${c.provider}/${c.model}`), caller: tag, err: e.message, ms },
        `AI primary failed (${cfg.provider}) — trying fallback chain (${chain.map((c) => c.provider).join(' → ')})`,
      );
      let lastErr: any = e;
      let cumMs = ms;
      for (const fb of chain) {
        const fStart = Date.now();
        try {
          const r = await withTimeout(runOnce(fb));
          const fMs = Date.now() - fStart;
          cumMs += fMs;
          logger.info(
            { ai: 'call', provider: fb.provider, model: fb.model, upstreamModel: r.upstreamModel, routedComplexity: r.complexity, routedProvider: r.routedProvider, realtimeSources: (r.realtimeSources || []).length, caller: tag, ms: fMs, fallback: true },
            `AI ok (fallback) → ${fb.provider}/${fb.model} • ${fMs}ms • ${tag}`,
          );
          pushCall({
            ts: new Date().toISOString(),
            provider: cfg.provider,
            model: cfg.model,
            source: cfg.source,
            caller: tag,
            ms: cumMs,
            ok: true,
            fallback: { provider: fb.provider, model: fb.model },
            upstreamModel: r.upstreamModel, routedComplexity: r.complexity, routedProvider: r.routedProvider, realtimeSources: (r.realtimeSources || []).length,
            promptChars: (opts.systemPrompt?.length ?? 0) + opts.prompt.length,
            responseChars: r.text.length,
          });
          return r.text;
        } catch (fe: any) {
          lastErr = fe;
          const fMs = Date.now() - fStart;
          cumMs += fMs;
          logger.warn(
            { ai: 'fallback_step_fail', provider: fb.provider, model: fb.model, caller: tag, ms: fMs, err: fe.message },
            `AI fallback step failed: ${fb.provider}/${fb.model} — ${fe.message}`,
          );
          if (!shouldFallback(fe)) break; // hard auth/config error → stop trying further providers
        }
      }
      logger.error({ ai: 'fail', primary: `${cfg.provider}/${cfg.model}`, caller: tag, ms: cumMs, err: lastErr.message }, 'AI primary + entire fallback chain failed');
      pushCall({ ts: new Date().toISOString(), provider: cfg.provider, model: cfg.model, source: cfg.source, caller: tag, ms: cumMs, ok: false, error: lastErr.message });
      throw lastErr;
    }
    logger.warn({ ai: 'fail', provider: cfg.provider, model: cfg.model, caller: tag, ms, err: e.message }, `AI fail ← ${cfg.provider}/${cfg.model} • ${tag}`);
    pushCall({ ts: new Date().toISOString(), provider: cfg.provider, model: cfg.model, source: cfg.source, caller: tag, ms, ok: false, error: e.message });
    throw e;
  }
}

export async function aiHealthcheck(cfg: ResolvedAI): Promise<{ ok: boolean; message: string }> {
  try {
    const t = await aiComplete(cfg, { prompt: 'reply with the single word OK', timeoutMs: 12_000, callerTag: 'healthcheck' });
    return { ok: true, message: `${cfg.provider}/${cfg.model}: ${t.slice(0, 60)}` };
  } catch (e: any) {
    logger.warn({ err: e.message }, 'AI healthcheck failed');
    return { ok: false, message: e.message };
  }
}

/**
 * Convenience wrapper around `aiComplete()` that also returns the recorded
 * call metadata (provider/model/upstream-model/latency). Useful when the
 * caller wants to persist the AI attribution alongside its own data
 * (e.g. paper_trades.ai_provider).
 */
export async function aiCompleteMeta(
  cfg: ResolvedAI,
  opts: CallOpts,
): Promise<{ text: string; meta: AICallRecord | null }> {
  const text = await aiComplete(cfg, opts);
  // The most-recent push is this call (newest is at the start of getRecentAICalls()).
  const meta = getRecentAICalls()[0] ?? null;
  return { text, meta };
}

export async function listAIModels(cfg: ResolvedAI): Promise<Array<{ id: string; name: string }>> {
  if (!cfg.apiKey) throw new Error('AI API key is not configured');
  if (cfg.provider === 'OpenAI' || cfg.provider === 'Arbiter') {
    const client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      defaultHeaders: { 'User-Agent': 'FinPredict-AI/1.1 (+https://finpredict.chkoushik.com)' },
    });
    const list = await client.models.list();
    return list.data.map((m) => ({ id: m.id, name: m.id }));
  }
  // Gemini supports models.list via REST
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cfg.apiKey)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Gemini models list failed: ${r.status}`);
  const j: any = await r.json();
  return (j.models ?? [])
    .filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m: any) => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
}
