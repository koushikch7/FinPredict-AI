# Changelog — FinPredict AI

> **This file is the single source of truth** for both human release notes and AI session context.
> Any AI assistant picking up work on this codebase should read the **Project Context** section
> below for current architecture, then scan recent version entries for what changed and why.
> Append a new version entry (or add to `[Unreleased]`) at the end of every work session.

---

## Project Context (always kept current)

**What:** Full-stack Indian stock market paper-trading platform with AI-driven buy/sell decisions.
Virtual accounts, real NSE/BSE prices, AI trader running on cron during NSE market hours.

**Live:** `https://finpredict.chkoushik.com`
**Server:** `[REDACTED-HOST]` · SSH: `[REDACTED-SSH-ENDPOINT]`
**Container:** `finpredict` (Docker, host port 3004 → container 3000)
**Source:** `/var/www/html/FinPredict-AI/` · GitHub: `github.com/koushikch7/FinPredict-AI` (branch: `main`)
**Stack:** React + Vite + TypeScript · Express + tsx · SQLite (better-sqlite3) · Docker

### Key Files

| File | Purpose |
|------|---------|
| `server/index.ts` | Express entry, middleware, route registration, background jobs |
| `server/routes/playground.ts` | Paper trading API: account, positions, manual trade, AI cycle trigger |
| `server/services/paper-trading.ts` | AI trader cycle, Kelly sizing, conviction scoring, risk controls |
| `server/services/ai.ts` | AI provider abstraction (Gemini/OpenAI/Arbiter), fallback chain |
| `server/services/prices.ts` | Yahoo Finance quote/history; `fetchYahooQuote()`, `latestPrice()` |
| `server/jobs/scheduler.ts` | All cron jobs (AI trader every 5min NSE hours, equity curve, news, backup) |
| `server/config.ts` | Zod-validated environment config |
| `src/pages/Playground.tsx` | Paper trading UI (606 lines) |
| `.env` | All secrets — never commit |

### AI Configuration

```
Primary:  DEFAULT_AI_PROVIDER=Arbiter, DEFAULT_AI_MODEL=auto
          → routes via https://arbiter.chkoushik.com/v1
Fallback: Gemini / gemini-2.5-flash
          NOTE: "auto" is invalid for Gemini SDK — resolveFallbackChain() substitutes gemini-2.5-flash
Paper trader timeout: 60s
```

### Stock Price Sources (priority order)

1. **Kite (Zerodha)** — needs daily OAuth token renewal; portfolio sync works; live quotes need paid subscription
2. **Yahoo Finance** `query1.finance.yahoo.com/v8/finance/chart/{SYM}.NS`
   - **MUST use Chrome User-Agent** — custom UAs get blocked from inside Docker
   - Current UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36`
3. **DB cache** `latestPrice(stockId)` — last resort when both above fail

### Background Jobs

| Job | Schedule | What |
|-----|----------|------|
| AI Trader | `*/5 * * * 1-5` (NSE hours) | `runAITraderCycle()` for users with `auto_trade=true` |
| Price snapshot | `*/10 * * * 1-5` (NSE hours) | `snapshotPrices()` — records live quotes for the liquid/active universe into `stock_prices` (powers regime, turbulence, liquidity floor, cached-price fallback) |
| Equity curve | `*/5 * * * *` | `recomputeEquity()` |
| News + FinBERT | `*/30 * * * *` | Fetch headlines, score sentiment |
| Prediction validation | `0 * * * *` | Validate pending predictions |
| IPO refresh | `0 */12 * * *` | AI-powered IPO analysis |
| Discovery scan | `0 */4 * * *` | Cross-cap opportunity scanner |
| Daily backup | `0 2 * * *` IST | OCI Object Storage |

### Deployment

```bash
# Quick single-file change (no rebuild)
docker cp /var/www/html/FinPredict-AI/server/<file> finpredict:/app/server/<file>
docker restart finpredict

# Full rebuild
cd /var/www/html/FinPredict-AI && docker compose up --build -d

# Logs / health
docker logs finpredict --since 10m
curl -s http://localhost:3004/api/health
```

### Known Issues / Open Items

- **Kite daily OAuth** — access_token expires daily; manual re-auth needed. Falls back to Yahoo until done.
- **Kite market data** — paid subscription needed for live tick quotes; Yahoo is the reliable fallback.
- **Arbiter 60s timeouts** — Gemini fallback handles this since v1.6.1. As of v1.6.2 the paper-trader also prefers `cerebras`/`groq` and avoids empty/coder providers, so most calls now resolve in ~2-3s.
- **Stale/renamed NSE symbols** — a handful of seeded tickers return Yahoo 404 (e.g. `AMARAJABAT`→`ARE&M`, `TATATELE`→`TTML`, `TATAMOTORS` split). v1.6.2 drops un-priceable symbols from the AI universe at runtime, but the seed list in `server/db/stock-seed.ts` should be cleaned up.
- **Dependabot** — 6 vulnerabilities (1 high, 4 moderate, 1 low). Review when possible.

---

## [Unreleased]

---

## [1.6.4] — 2026-06-15

Dependency-vulnerability remediation + Arbiter AI reliability hardening. `npm audit` reported 11 advisories (7 high, 4 moderate) on the default branch; all are now resolved (`found 0 vulnerabilities`). A live + log-based review of the Arbiter gateway confirmed the API is healthy (~97% first-try success in production with a working fallback chain); the only recurring issue was the `pollinations` free provider returning 200-OK **empty** bodies, which is now both avoided and caught for every call type.

### Security

- **All 11 dependency advisories fixed** (`package.json`, `package-lock.json`) — `npm audit` is now clean:
  - `axios` → 1.18.0 (8 advisories: ReDoS, NO_PROXY bypass, Proxy-Authorization leak/injection, prototype-pollution MITM — high).
  - `react-router` / `react-router-dom` → patched (DoS via unbounded path expansion in `__manifest` — high).
  - `fast-xml-builder`, `protobufjs`, `qs` (→ via `express` 4.22.2), `ws` 8.21.0 — moderate/high DoS + bypass advisories.
  - `esbuild` (high: dev-server arbitrary file read + Deno-module RCE) — cleared by upgrading **Vite 6 → 8.0.16** and moving `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` from `dependencies` to **`devDependencies`** (they are build-only). The production image (`npm ci --omit=dev`) now contains no `vite`/dev-server `esbuild`; the only remaining `esbuild` is the **patched 0.28.1** pulled by `tsx` (the runtime), which is not subject to the advisory (≤ 0.28.0).

### Fixed

- **Arbiter empty-response handling now covers every call, not just JSON** (`server/services/ai.ts`) — `runOnce()` previously only treated a 200-OK-but-empty body as a failure when `opts.json` was set. Non-JSON callers (chat, healthcheck, prediction explanations) could therefore receive a silent blank reply with no fallback. The empty-body guard now fires for **all** calls, so an empty response always routes through `shouldFallback()` to the next provider.
- **`pollinations` avoided by default on Arbiter** (`server/services/ai.ts`) — the `auto` router intermittently dispatched to `pollinations`/`openai-fast`, which consistently returns empty content (verified live). A baseline `avoid_providers: ['pollinations']` is now always sent to Arbiter (merged with any caller-supplied list), so the gateway skips it before wasting a round-trip.
- **Docker healthcheck false-negative** (`Dockerfile`) — the `HEALTHCHECK` used `wget http://localhost:3000/...`, but inside Alpine `localhost` resolves to IPv6 `::1` first while the server binds IPv4 `0.0.0.0`, so `wget` got `Connection refused` and the container was flagged `unhealthy` even though it was serving traffic normally. Switched the probe to `http://127.0.0.1:3000` (forces IPv4). Real traffic via the host port mapping was never affected.

### Verified

- **Arbiter API health:** `GET /v1/models` → HTTP 200; a live `chat/completions` with `pollinations` avoided routed to Cloudflare `@cf/openai/gpt-oss-20b` and returned valid content in ~1.4s. Production logs over the review window: **31 AI ok / 1 fail** (a transient double-outage where Arbiter returned empty *and* the Gemini fallback was 503 — handled gracefully, no crash).
- `npm run typecheck` + `vite build` (v8) clean; image rebuilt + redeployed; container reports **healthy**; `npm audit` = 0 vulnerabilities.

---

## [1.6.3] — 2026-06-15

Enterprise audit + remediation release. A full security / performance / functional review (code, 11 days of live container logs, and the production DB) was run against the deployed system. The audit clarified that the reported “shared credentials” symptom is **not** session/data bleed (all routes are correctly `user_id`-scoped, no IDOR, no SQL injection) but rather **global AI provider keys** silently inherited by every user, plus two real secret-handling gaps. Paper-trading losses were root-caused on user 2’s live account: equity ₹96,102 (−3.9%) with **₹3,057 (3.06%) paid in fees across 185 trades** — overtrading + a non-functional trailing stop + a stop-loss silently disabled on stale-quote symbols were the dominant drags. The highest-value, lowest-risk fixes were implemented and deployed; deeper prediction-algorithm changes are catalogued under Notes for review.

### Security

- **Secrets masked in `GET /api/admin/config`** (`server/routes/admin.ts`) — the endpoint previously returned every `configurations` value (including AI/broker API keys) in **plaintext** to the browser. Keys matching `KEY|SECRET|TOKEN|PASSWORD` are now returned masked (`••••••••<last4>`) with `is_secret` / `has_value` flags. The Admin **Config** UI (`src/pages/Admin.tsx`) shows the mask as a placeholder and only writes a secret when an admin actually types a new value, so the mask can never be saved back over a real key.
- **AI endpoints rate-limited** (`server/index.ts`) — only `/api/auth/*` was throttled, leaving every LLM-triggering route open to cost-explosion / DoS abuse. Added a 40-request / 5-min per-IP limiter on `/api/chat/send`, `/api/predictions/generate`, `/api/predictions/top-picks`, `/api/playground/run-ai`, and `/api/discovery/scan`. Verified live (`RateLimit-Policy: 40;w=300`).

### Fixed

- **Trailing stop never fired** (`server/services/paper-trading.ts`) — the “peak” was derived from the most-recent BUY price, which collapsed to ≈ current price, so `drawdownFromPeak ≈ 0` and the tiered trailing-stop give-back was effectively inert (winners gave back gains). A persisted per-position **`peak_price` high-water mark** (new column, idempotent migration) is now bumped on every new high and drives the trail.
- **Stop-loss silently disabled on stale-quote symbols** (`server/services/paper-trading.ts`) — in the risk pre-pass a failed quote fell back to `average_price`, making `pnlPct = 0%` so neither the hard stop-loss nor take-profit could ever trigger for that name. The pre-pass now uses the freshest live or DB snapshot price and **skips** risk evaluation when no real price is available, instead of evaluating against a fabricated break-even.
- **Renamed/demerged NSE tickers 404’d every cycle** (`server/services/prices.ts`) — `TATAMOTORS`, `TATATELE`, and `AMARAJABAT` returned Yahoo 404 on every quote/history/snapshot call (log noise + a permanently un-priceable position). Added a verified `YAHOO_SYMBOL_REMAP` (`TATAMOTORS→TMPV`, `TATATELE→TTML`, `AMARAJABAT→ARE&M`) applied in both `fetchYahooQuote()` and `fetchYahooHistory()`. Zero `TATAMOTORS` errors since deploy.

### Changed

- **Anti-churn guardrails on the paper trader** (`server/services/paper-trading.ts`) — to stop fee-bleed from over-trading (185 trades / ₹3,057 fees on a ₹1L account):
  - `CASH_RESERVE_PCT = 0.10` — the BUY sizing cash limit now reserves a 10% portfolio cash floor so the account is never ≈100% deployed (was `cash × 0.95`, which left ₹1,801 free with 10 open positions).
  - `MIN_HOLD_MINUTES = 60` — discretionary AI **SELL**s are rejected if the position was opened < 60 min ago (prevents same-/next-cycle flip-flopping). Hard risk exits (stop-loss / take-profit / trailing) run in the pre-pass and are **exempt**.
- **AI Chat grounded in live, real-time context** (`server/services/chat.ts`) — the assistant now also receives: live per-symbol **technicals** (RSI w/ zone, MACD bias, price-vs-20d-SMA) computed from 120-day history; per-symbol **FinBERT sentiment** (7-day avg + trend); **broad-market sentiment** (3-day FinBERT); and the user’s **paper-trading account** (equity, cash, P&L, open positions). Previously chat saw only quotes + portfolio + watchlist + predictions + news.
- **Chat renders Markdown** (`src/pages/Chat.tsx`, `src/index.css`) — assistant replies were shown as raw plain text (literal `*`, `#`, fences). Replies are now rendered as Markdown via `marked`, **HTML-escaped first** so model output cannot inject scripts (no extra sanitiser dependency). New `.chat-prose` styles cover lists, tables, code, headings, blockquotes.

### Notes

- **Migration:** adds nullable `paper_positions.peak_price` (idempotent; back-fills lazily from live highs). No breaking API/schema changes.
- **Deploy:** `npm run typecheck` + `vite build` clean; image rebuilt and redeployed; container healthy; migration applied; fixes verified live (rate-limit headers, masked config, renamed-symbol resolution, `peak_price` present).
- **Deferred for review (catalogued, not yet implemented):** enforce strictly per-user AI keys (remove silent global fallback); remove look-ahead bias in `predictions.buildContext()` (uses today’s close); raise the 0.5% prediction-validation threshold above round-trip cost; complete `updateFeatureWeights()`; regime-aware RSI in the technical-strength score; chat token streaming (SSE); batched/parallel quote fetching + price-cache age metadata.

---

## [1.6.2] — 2026-06-03

Major reliability fix release. The Playground AI trader was running every cycle but **never buying or selling** — it would log `decisions:N, executed:0, errors:N` (or crash on empty AI responses). Root-caused via live log + DB analysis to a combination of two deterministic SQLite schema bugs, an AI-response-reliability gap, a missing price-history job, and a cold-start regime trap. After these fixes a live cycle on a fresh account produced 3 high-conviction BUYs and executed all 3 cleanly (`executed:3, errors:0`).

### Fixed

- **CRITICAL: every BUY threw `no such column: date`** (`server/services/paper-trading.ts` → `avgDailyTurnover20d`) — the liquidity-floor query selected `AVG(close * volume)` filtered on a `date` column, but `stock_prices` has no `date` column (it has `timestamp`) and an unpopulated `close`. The query threw on **every** BUY attempt, was caught by the execution try/catch, and surfaced as a generic error → the trade was silently dropped. Now uses `timestamp` + `COALESCE(close, price)`.

- **CRITICAL: every BUY threw `no such column: p.last_price`** (`server/services/paper-trading.ts` → `sectorExposurePct`) — the sector-concentration query referenced `p.last_price`, but `paper_positions` only has `quantity` + `average_price`. Same failure mode as above (every BUY blocked). Now uses `average_price` as the notional proxy.

- **Empty AI responses silently killed the cycle** (`server/services/ai.ts`) — Arbiter's `auto` router frequently dispatched the paper-trader to flaky free providers (Cloudflare Workers AI `@cf/openai/gpt-oss-120b` returned **0 chars**; ollama `qwen3-coder:480b-cloud` — a *coding* model — returned empty/`{"decisions":[]}` after 48s). A 200-OK-but-empty body was treated as success, so `JSON.parse('')` threw downstream and the fallback chain never fired. `runOnce()` now throws on an empty JSON response and `shouldFallback()` treats it as retryable, so the Gemini fallback (and the chain) actually engages.

- **Cold-start regime trap** (`server/services/paper-trading.ts`) — `detectMarketRegime()` reads `stock_prices`, which was empty (see new price-snapshot job below), so it always returned `Sideways` → the most conservative "wait for RSI<35 / avoid chasing" playbook → the AI never bought → never built positions → never left Sideways. The regime is now refined from the **live Yahoo technicals already in `ctxs`** (close-vs-20-SMA breadth + average 1-day change) whenever DB price history is insufficient, so the AI gets a real Bullish/Bearish/Sideways signal immediately.

- **Sector cap hard-rejected the first position** (`server/services/paper-trading.ts`) — the per-position cap (33% for Aggressive) is looser than the 30% sector cap, so a single max-sized buy in an empty sector always exceeded 30% and was hard-rejected, meaning a fresh account could never open its first position. The 30% sector cap is now folded into position **sizing** (the quantity is shrunk to fit the sector headroom) instead of rejecting outright; a defense-in-depth check remains.

### Changed

- **Paper-trader AI call hardened** (`server/services/paper-trading.ts`) — now mirrors the proven Discovery pattern: `preferProvider: 'cerebras'`, `avoidProviders: ['pollinations','cloudflare','ollama','huggingface']`, robust `{ decisions }` JSON extraction (handles prose/code-fence wrapping), and a one-shot stricter retry (temp 0, `preferProvider: 'groq'`) before giving up. Trade-decision calls now typically resolve in ~2-3s with valid JSON instead of timing out or returning empty.

- **AI universe quality** (`server/services/paper-trading.ts`) — symbols Yahoo can't price (stale/renamed NSE tickers) are dropped from the universe + context before the AI call, so the model isn't fed empty contexts that bias it toward HOLD. Currently-held symbols are always retained so the AI can still SELL them.

### Added

- **Price-snapshot cron** (`server/jobs/scheduler.ts`, `server/services/prices.ts` → `snapshotPrices()`) — every 10 min during NSE hours, records live quotes for the liquid/active universe (held + watchlist + recent discovery picks + large/mid tiers) into `stock_prices`. This was previously **never populated by any job**, which is what left regime detection, the turbulence index, the liquidity floor and the manual-trade cached-price fallback without data.

### Notes

- No database migrations required (all fixes are schema-compatible; the bugs were *queries* referencing non-existent columns).
- No breaking changes to the API or frontend.
- Deployed via `docker cp` of the four changed files (`paper-trading.ts`, `ai.ts`, `prices.ts`, `scheduler.ts`) + `docker restart finpredict` (tsx runtime, no build step). Verified with `npm run typecheck` and a live AI cycle.

---

## [1.6.1] — 2026-06-02

Hotfix release. Three production bugs discovered via log analysis of the live deployment.

### Fixed

- **Yahoo Finance User-Agent blocked** (`server/services/prices.ts`) — The custom `Mozilla/5.0 FinPredict` User-Agent was being rate-limited/timed out by Yahoo Finance from inside the Docker container (HTTP 429 from host, TCP timeout from container). Changed to a standard Chrome browser User-Agent. All stock quote and history fetches now succeed. This was the root cause of the playground being slow and manual trades failing.

- **Manual trade / quote broken when Yahoo unavailable** (`server/routes/playground.ts`) — `GET /api/playground/quote/:symbol` and `POST /api/playground/trade` threw `"Could not fetch live price"` hard errors whenever Yahoo Finance was unreachable, making it impossible to place any manual trade. Both endpoints now fall back to the last cached price in the database (`latestPrice(stock.id)`) when Yahoo returns `null`. Response includes `{ stale: true }` / `{ price_source: "cached" }` so the UI can surface a stale-price warning. A hard error is only thrown when both Yahoo and the DB cache return nothing.

- **Gemini fallback using invalid model `"auto"`** (`server/services/ai.ts`) — `DEFAULT_AI_MODEL=auto` in `.env` is correct for the Arbiter/OpenAI gateway (which supports model routing via `"auto"`), but the Gemini SDK does not recognise `"auto"` as a model ID and returns an immediate 404. When Arbiter timed out (up to 60 s), the fallback chain tried `Gemini/auto`, got a 404, and the entire AI cycle failed with no recovery. `resolveFallbackChain()` now substitutes `gemini-2.5-flash` whenever the configured model is `"auto"` and the fallback provider is Gemini. Confirmed working: Gemini now successfully handles requests when Arbiter is slow.

### Notes

- No database migrations required.
- No breaking changes to the API or frontend.
- All three fixes are deployed via Docker image rebuild (`docker compose up --build -d`).

---


- CSV portfolio import for non-Kite brokers
- WebSocket live ticks (Kite)
- Code-splitting to drop main bundle below 250 kB gzip
- Configurable tax regime & annual income in profile settings

## [1.6.0] — 2026-05-23
Major AI intelligence upgrade: integrates FinBERT NLP sentiment analysis, expands technical indicators to 30+ factors, adds calibrated conviction scoring, ensemble prediction consensus, market turbulence detection, and closed-loop prediction feedback.

### AI Enhancement — Phase 1: FinBERT Sentiment Scoring
- **FinBERT integration** via HuggingFace Inference API (`ProsusAI/finbert`) — scores news headlines as positive/neutral/negative with numeric -1 to +1 composite score.
- Sentiment scores persisted in `news_articles.sentiment` + `sentiment_score` columns (previously dead/unused).
- Per-symbol 7-day sentiment averages and trend detection (`improving`/`declining`/`stable`).
- Broad market sentiment (3-day aggregate) injected into AI trading prompts.
- Automatic scoring of new headlines on persist + 15-minute background cron for un-scored backlog.
- New service: `server/services/sentiment.ts`

### AI Enhancement — Phase 2: Enhanced Technical Indicators (Alpha158-inspired)
- Expanded from 8 to 30+ technical indicators in `computeEnhancedTechnicals()`:
  - **Volume**: OBV, VWAP (20-period), Volume Ratio (current/SMA20)
  - **Momentum**: Williams %R, Stochastic %K/%D, CCI, Rate of Change (ROC-12)
  - **Volatility**: ATR (14), Historical Volatility (20-day annualized)
  - **Trend**: ADX/DI+/DI- (14), price position vs 52-week high/low
- **Composite Technical Strength Score (0-100)** — weighted combination of all indicators producing a single actionable signal.
- OHLCV data now fully utilized (previously only close prices were used for analysis).

### AI Enhancement — Phase 3: Calibrated Conviction Scorer
- **Programmatic conviction floor** — data-driven 0-1 score that BLOCKS trades where data contradicts LLM optimism.
- Combines: technical strength, sentiment score/trend, prediction accuracy history, volume confirmation, trend alignment, market regime.
- Finally activates the `feature_reliability` table (previously seeded but never used).
- Weights auto-adjust based on actual prediction outcomes (Phase 6 feedback).
- New service: `server/services/conviction.ts`

### AI Enhancement — Phase 4: Ensemble Prediction (Multi-Signal Consensus)
- LLM conviction averaged with programmatic conviction — both must agree for high-confidence trades.
- Disagreement penalty: if LLM and programmatic scores differ by >0.3, applies -0.15 penalty.
- Ensemble score must be ≥ 0.55 for BUY orders (prevents overconfident single-signal trades).
- Programmatic floor of 0.40 — blocks any BUY regardless of LLM conviction.

### AI Enhancement — Phase 5: Turbulence Index (Regime-Aware Position Sizing)
- Computes market turbulence from recent vs. historical volatility across the portfolio universe.
- Three levels:
  - **Normal** — trade freely (multiplier 1.0×)
  - **Elevated** — halve all new position sizes (multiplier 0.5×)
  - **Extreme** — block ALL new buys entirely (capital preservation)
- Inspired by FinRL's turbulence detection methodology.

### AI Enhancement — Phase 6: Prediction Feedback Loop
- Weekly auto-recalibration of `feature_reliability` weights (Sunday cron) based on last 30 days of validated predictions.
- Tracks Technical and Sentiment signal accuracy independently.
- Weights bounded 0.1–0.5 to prevent single-factor dominance.
- `getPredictionAccuracy()` — rolling accuracy per symbol+strategy for conviction scoring.
- `input_snapshot` now stores `technicalStrength`, `sentiment_score`, and `sentiment_trend` for retrospective analysis.

### Added
- `server/services/sentiment.ts` — FinBERT sentiment scoring via HuggingFace router API
- `server/services/conviction.ts` — Calibrated conviction scorer with feature reliability weights
- `HUGGINGFACE_API_KEY` environment variable in `.env` and config schema
- `computeEnhancedTechnicals()` in technicals.ts — 30+ indicator suite
- `computeTurbulence()` in paper-trading.ts — market volatility regime detection
- FinBERT scoring cron (every 15 min) in scheduler
- Feature weight update cron (weekly) in scheduler

### Changed
- `server/services/technicals.ts` — expanded from 100 to 300+ lines with full indicator suite
- `server/services/predictions.ts` — `buildContext()` now returns enhanced technicals + sentiment data
- `server/services/paper-trading.ts` — integrated conviction scorer, ensemble filter, turbulence multiplier, sentiment in prompts
- `server/services/news.ts` — auto-triggers FinBERT scoring after headline persistence
- `server/jobs/scheduler.ts` — added sentiment + feature weight update cron jobs
- `server/config.ts` — added `HUGGINGFACE_API_KEY` to schema
- `.dockerignore` — removed README.md exclusion (needed in container for docs API)
- `Dockerfile` — added `COPY --from=builder /app/*.md ./` for documentation serving

## [1.5.0] — 2026-05-23
Complete overhaul of the AI paper-trading engine for profitability. Adds realistic Indian market charges, conviction-based filtering, trailing stop-loss, and comprehensive documentation system.

### Trading Algorithm (Breaking Change — Improves P&L)
- **Realistic Indian Market Charges** — Replaced flat 0.1% fee with actual costs:
  - STT: 0.1% on both BUY and SELL (delivery)
  - Brokerage: 0.03% or ₹20 cap (discount broker model)
  - GST: 18% on brokerage + exchange charges
  - Exchange transaction charge: 0.00345%
  - SEBI charges: ₹10 per crore
  - Stamp duty: 0.015% on buy side only
- **Conviction Threshold** — Only executes BUY orders with conviction ≥ 0.70 (previously: any value accepted). SELL requires ≥ 0.50.
- **Anti-Churn: Max 3 Buys/Cycle** — Reduced from 6-8 to prevent over-trading which was the #1 cause of losses (221 buys on ₹1L capital).
- **Trailing Stop-Loss** — Positions that gain >5% are protected by a 4% trailing stop from peak (locks in profits instead of giving them back).
- **Partial Take-Profit** — Sells 50% at target instead of full dump; remaining 50% rides with trailing stop for further upside.
- **No Intraday Trading** — Removed Intraday horizon from AI execution; minimum hold is Short-term (days-weeks). Intraday trades were losing ₹146 avg.
- **Break-Even Filter** — Rejects trades where all-in costs (charges + STCG tax) are too high relative to position size.
- **Anti-Fixation Window** — Increased to 120 minutes (from 60) between same-stock buys.
- **STCG Tax Awareness** — 15% short-term capital gains factored into minimum profit calculations.
- **Improved AI Prompt** — Complete rewrite emphasizing:
  - Quality > quantity, patience, HOLD bias when uncertain
  - 2:1 minimum reward-to-risk ratio requirement
  - Explicit break-even % communicated to AI
  - Regime-specific entry criteria (RSI/SMA/volume thresholds)
  - Must include stop-loss level and target price in every decision
  - Learns from past strategy P&L (avoids losing strategies)
  - Returns empty decisions when no good setups exist
- **Decisions sorted by conviction** — Highest conviction trades get priority within the per-cycle buy limit.
- **Realized P&L calculation improved** — Now includes buy-side charges in the P&L calculation for accuracy.

### Pre-Fix Performance Analysis
| Metric | Before | Target After |
|--------|--------|-------------|
| Win Rate | 39.6% (46/116) | >55% |
| Avg Win / Avg Loss | ₹62 / ₹114 (0.54:1) | >1.5:1 |
| Total Fees Drag | ₹2,351 (2.35% of capital) | <₹500 (<0.5%) |
| Stop-Loss Avg | -₹713 | -₹200 |
| Total Buys | 221 (excessive churn) | ~50-70 |
| Intraday Trade Avg P&L | -₹146 | N/A (disabled) |

### Documentation
- **User Guide** (`USER_GUIDE.md`) — Complete feature walkthrough covering all 9 sections with both user-friendly and technical explanations.
- **Documentation Page** — Rewritten `/docs` page with 4-tab navigation (User Guide, Requirements, README, Changelog) that renders markdown from source files.
- **Footer** — Desktop footer with version info and direct links to each documentation tab.
- All documentation sources are markdown files at workspace root (single source of truth):
  - `README.md` — Project overview, architecture, deployment
  - `REQUIREMENTS.md` — Functional & non-functional requirements
  - `CHANGELOG.md` — Version history
  - `USER_GUIDE.md` — User-facing feature guide

### Added
- `USER_GUIDE.md` — new documentation file at workspace root
- `GET /api/docs/:name` — API endpoint to serve documentation markdown files
- Footer component in AppShell with documentation links
- `prose-doc` CSS class for documentation typography
- `calculateCharges()` function — computes realistic per-trade Indian market costs
- `minimumBreakevenPct()` function — calculates minimum profitable price move

### Changed
- `server/services/paper-trading.ts` — complete trading logic overhaul (see Trading Algorithm above)
- `src/pages/Docs.tsx` — rewritten as 4-tab layout fetching from `/api/docs/` endpoint
- `src/components/AppShell.tsx` — added desktop footer with doc links
- `src/index.css` — added `prose-doc` typographic styles for documentation
- `package.json` — version bumped to 1.5.0

### Fixed
- Paper trading running at a loss due to over-trading (churning), low conviction entries, and unrealistic fee model
- Intraday trades consistently losing money (now blocked)
- Take-profit dumping entire position at target (now sells 50%, trails rest)
- Stop-loss triggering massive losses because no trailing mechanism existed

## [1.3.2] — 2026-05-01
Second round of bug fixes from end-to-end code audit: security hardening, UX unblocking, and stability improvements.

### Security
- **CORS any-origin with credentials** (OWASP A05:2021) — The CORS handler reflected every origin back as allowed while `credentials: true` was set, enabling cross-site request forgery from any domain. Origin is now validated against an explicit allowlist (`APP_URL` + localhost variants). Unauthorized origins receive a CORS error.
- **NewsAPI key in URL** (OWASP A02:2021) — API key was appended to the request URL query string, exposing it in server access logs, reverse-proxy logs, and browser history. Moved to the `X-Api-Key` request header.

### Fixed
- **Playground blocked for new users** — `requireBroker()` gate was applied to all playground routes (reset, manual trade, run-ai, settings), throwing `403 Forbidden` for any user without a real broker connection. Paper trading is a virtual simulation; broker integration is only relevant for the Portfolio sync feature. Gate removed from all playground routes.
- **No change-password endpoint** — Users had no way to change their own login password (only admins could reset via DB). Added `POST /api/auth/change-password` (requires current password, bcrypt-verified). Settings page now includes a Change Password card.
- **No delete-user admin endpoint** — Admin panel could create users but not delete them. Added `DELETE /api/admin/users/:id` with guards: cannot self-delete, non-Super-Admin cannot delete a Super Admin.
- **Service worker cache never invalidates** — `const VERSION = self.__FINPREDICT_VERSION__ || 'v1'` always resolved to `'v1'` because the placeholder was never replaced at build time. Added a Vite `writeBundle` plugin that patches `dist/sw.js` with a build-timestamp version (e.g. `v1746100000000`) after every `npm run build`, ensuring stale shells are evicted on deploy.
- **Equity curve table over-sampling** — `recomputeEquity()` inserted a new row into `paper_equity_curve` every 5 minutes even for accounts with zero open positions, inflating the table with identical cash-only rows. Added a 60-minute throttle when no positions are held.

### Added
- `DELETE /api/admin/users/:id` — admin endpoint to remove a user account (cascades to all user data via FK).
- `POST /api/auth/change-password` — self-service password change for any authenticated user.
- Change Password card on Settings page (`/settings`).
- Vite `swVersionPlugin` in `vite.config.ts` — injects build timestamp into service worker for reliable cache busting.

## [1.3.1] — 2026-05-01
Critical bug fixes + stability improvements from comprehensive code analysis.

### Fixed
- **CRITICAL**: Stock seeding failure — added `tier` column to `stocks` table schema (was missing, causing 150/166 stocks to fail insertion). All 166 stocks now seed correctly.
- **CRITICAL**: No global unhandled promise rejection handler — added `process.on('unhandledRejection')` and `process.on('uncaughtException')` to prevent server crashes from async errors in cron jobs or AI calls.
- **HIGH**: Missing React ErrorBoundary — wrapped App in `<ErrorBoundary>` to catch component errors and show recovery UI instead of blank white screen.
- **HIGH**: Potential paper-trading race condition — added `traderRunning` in-flight guard to prevent AI trader cron from double-executing trades when a cycle runs longer than the interval.
- **MEDIUM**: Database healthcheck missing — `/api/health` now tests `SELECT 1` against SQLite and returns `db: 'ok'` or 503 error.
- **MEDIUM**: Missing `stock_prices.timestamp` index — added standalone timestamp index for faster cross-stock historical queries.

### Security
- User `chk` password reset reminder (local DB only, not in git) — change via Settings page.

### Documentation
- Added `BUG_ANALYSIS.md` — comprehensive 12-issue audit report with severity ratings, root causes, fixes, and action plan.

## [1.3.0] — 2026-04-30
Mobile + PWA pass. The app is now installable on Android, iOS, Windows and macOS, ships with a hand-crafted finance/AI logo + favicon set, and has been audited for small-screen ergonomics. Also adopts Arbiter v1.12+ routing hints.

### Added
- **Arbiter v1.12+ routing metadata** — when the resolved provider is Arbiter, our OpenAI-compatible payload now includes `metadata.arbiter_intent` (mapped from caller tag: `predictions`/`paper-trader`/`ipo` → `reasoning`, `chat` → `balanced`, `discovery`/`healthcheck` → `fast`), `metadata.priority` (`quality` | `speed` | `balanced`), and `fallback: 'chain'` so the gateway performs a capability-matched cross-provider fallback **before** our SDK-level chain kicks in. Verified end-to-end: a healthcheck call from inside the production container resolves through Arbiter's auto-router to `gemini-3.1-flash-lite-preview` in ~55 ms. Vanilla OpenAI ignores the unknown fields (schema is `additionalProperties: true`), so the change is forward-safe.
- **Progressive Web App** — `public/manifest.webmanifest` (name, theme-color `#0F172A`, standalone display, three home-screen shortcuts: Playground / Predictions / Portfolio) plus a hand-rolled `public/sw.js` service worker. Strategy: cache-first for hashed `/assets/*` chunks, network-first for navigations (with offline shell fallback to `/`), stale-while-revalidate for icons, and **never** intercept `/api/*` (data freshness wins). Cache name is versioned so deploys evict stale shells cleanly.
- **Logo + icon set** — bull-market motif (rising candlesticks + emerald trendline + violet AI sparkles on indigo gradient) at `public/logo.svg`, plus PNG variants (`icon-192.png`, `icon-512.png`, `apple-touch-icon.png` 180×180), a separate full-bleed `maskable-icon.svg` for adaptive Android icons, simplified `favicon.svg`, and a multi-resolution `favicon.ico`.
- **In-app install prompt** (`src/components/InstallPWA.tsx`) — captures the `beforeinstallprompt` event on Chromium / Edge / Android and surfaces a native install button; on iOS Safari (which has no programmatic API) shows a one-time hint pointing to **Share → Add to Home Screen**. Dismissals are remembered for 30 days.
- **Brand mark in shell** — both the desktop sidebar header and the mobile top bar now render the new logo SVG alongside the `FinPredict` wordmark.

### Changed
- **`index.html`** — full PWA head: `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-touch-icon`, manifest link, OG image, `viewport-fit=cover` for iOS notches, `format-detection: telephone=no`. Service worker registered after `load`.
- **`src/index.css`** — mobile safety net: `overflow-x: hidden` on `html/body/#root` to kill stray horizontal scroll, `.table-scroll` helper, 40px minimum tap-targets on coarse pointers, tighter card padding on `<480px`, and `safe-area-inset-bottom` honoured by `.mobile-bottom-nav`.

### Notes
- The existing mobile drawer + 5-item bottom nav from earlier work is preserved; only the brand header was upgraded.
- No new runtime dependencies — service worker is hand-written rather than via `vite-plugin-pwa`, keeping the bundle and config surface small.

## [1.2.2] — 2026-04-30
Profitability + UX pass. Adds closed-loop strategy attribution, market-regime detection, profit/loss-coloured equity curve, full tooltip coverage on every input, and a much smarter Manual Trade modal that cannot overdraw cash.

### Added
- **Strategy attribution** — every paper trade now persists `strategy_tag`, `realized_pnl` and `market_regime`. Migrations add the columns idempotently.
- **Market regime detector** (`detectMarketRegime`) — computes median 20-bar return + breadth across the candidate universe and tags each AI cycle with `Bullish` / `Bearish` / `Sideways`. The regime + a regime-appropriate playbook hint are injected into the AI system prompt so strategy adapts to the tape (trend-follow in bull markets, mean-revert in chop, defensive in selloffs).
- **Closed-loop strategy feedback** — `getStrategyStats(accountId)` aggregates realised P&L per `(strategy_tag, horizon)` from closed SELL trades, exposed at `GET /api/playground/strategy-stats` and surfaced as the new **Strategy Performance** card on the Playground. The same stats are passed back into the AI prompt as a feedback signal so the model biases toward playbooks that have actually worked on this account.
- **Manual Trade modal upgrade** — now shows live LTP, current cash, currently-held quantity, gross/fee/net cost preview, and a "max affordable shares" hint. Includes Horizon (Intraday/Short-term/Long-term), Strategy tag and Reason/thesis fields. **BUY is hard-blocked client- and server-side when net cost > available cash**; SELL is hard-blocked beyond held quantity. Backed by a new `GET /api/playground/quote/:symbol` endpoint.
- **Equity curve P&L colouring** — `AreaCurve` now accepts a `baseline` prop; the area is filled with a green→red Y-axis-aligned gradient pivoted on the baseline (= starting capital), with a dashed reference line. Above-baseline gains render green, below-baseline losses render red.
- **Field tooltips everywhere** — `Field` component gained a `tooltip` prop that renders a `?` info icon next to the label. Every input on the Playground (Auto-trade, Strategy, Risk Level, Universe, Max Position %, Stop-Loss %, Take-Profit %, Daily Loss Kill-Switch %, Manual-trade Symbol/Side/Qty/Horizon/Strategy/Reason, Reset capital) now has a long-form explanation.
- **Trade tape tooltip** — hovering the symbol cell shows side/qty/price, horizon, strategy tag, regime at trade time, realised P&L, AI provider/model/upstream/latency and the full reason. Trade tape table also renders Strategy and Realised P&L columns directly.

### Changed
- **AI cycle now tags every trade** with the chosen `strategy_tag` and current `market_regime`. Forced stop-loss/take-profit closes are tagged `risk:stop-loss` / `risk:take-profit`.
- **AI prompt rule** added: each decision must include a `strategy_tag` from {momentum, mean-reversion, breakout, value, swing, defensive, news-driven, hedge}.
- **Manual trade endpoint** (`POST /api/playground/trade`) accepts optional `horizon`, `reason`, `strategy_tag` and pre-validates cash before execution.

### Fixed
- Manual trades no longer record a blank Horizon — modal forces a selection.
- Manual trades could previously bypass cash visibility — modal now shows cash + LTP + cost preview, and the Execute button is disabled when insufficient.

### Verified
- `paper_trades` schema after boot includes `id, account_id, stock_id, side, quantity, price, gross, fees, net, reason, ai_decision, executed_at, horizon, ai_provider, ai_model, ai_upstream_model, ai_latency_ms, strategy_tag, realized_pnl, market_regime`.
- All TypeScript files compile clean (`get_errors` returned no errors).
- Image rebuilt and deployed; migrations log "Database migrations applied" with stockCount=166 on boot.

## [1.2.1] — 2026-04-30
Trader profitability + observability pass. Beefs up the AI prompt with full market context, adds an anti-fixation guard, fixes a couple of date/time bugs, and surfaces the AI engine + daily-loss gauge directly in the Playground UI.

### Added
- **Anti-fixation guard** — the AI cannot BUY the same symbol more than `FIXATION_MAX_BUYS_IN_WINDOW = 1` times within `FIXATION_WINDOW_MIN = 60` minutes. Both the system-prompt rule list and a hard server-side gate enforce it. Prevents the trader from compounding into a single name across consecutive cycles (root cause of the recent ITC fixation).
- **Richer AI trader context** — every cycle prompt now includes per-symbol technicals (RSI/MACD/SMA/EMA/Bollinger from `buildContext`), 30 most-recent candles, per-symbol news headlines, **macro/market headlines**, **recent prediction history** for those symbols, **sector mix**, **position weights as % of total equity**, **today's drawdown vs the kill-switch**, and the explicit list of symbols blocked by the anti-fixation gate. Forces the LLM to diversify and use evidence rather than picking one obvious BUY.
- **AI attribution on every paper trade** — new `paper_trades.ai_provider`, `ai_model`, `ai_upstream_model`, `ai_latency_ms` columns. Persisted via a new `aiCompleteMeta()` wrapper around `aiComplete()` that returns the same metadata pushed to the in-memory diagnostics ring buffer.
- **Trade tape `AI` badge tooltip** — hover any AI trade in the Playground tape to see `<provider>/<model> → <upstream-model> • <ms>ms` plus the AI's reason.
- **AI Trader Status card** now shows the **AI engine** (provider/model + resolution source) and a **daily P&L vs kill-switch** progress bar.
- **Effective universe display** — Playground "Universe" field shows the AI's actual effective list (`Discovery ∪ Watchlist ∪ holdings` in auto mode), not just the user-configured shortlist.
- **`runAITraderCycle()` return** now includes `daily_dd_pct` and `ai: { provider, model, upstream_model, ms }` so callers / future UIs can render it without a second API call.
- **Cycle-skip log lines** — `AI trader: skipped (auto_trade OFF)` / `AI trader: skipped (NSE closed)` so the log clearly shows why a cycle didn't run.

### Changed
- **AI BUY discipline** — prompt explicitly caps decisions at "6–8 BUYs per cycle, consolidate over churn", asks the model to reduce positions when conviction drops, and to take profits proactively on rallies.
- **AI trader temperature** lowered `0.4 → 0.3` for steadier decisions; timeout raised `45 s → 60 s` to accommodate the larger context.
- **Per-symbol context fetch** is now parallelised (`Promise.all` over `buildContext`) and covers the first 12 universe symbols (was 10, sequential).
- **`AreaCurve` chart** auto-zooms its Y-axis (5% padding around `[min, max]` instead of 0-anchored) and thins X-axis labels (`minTickGap=40`). The equity curve no longer looks dead-flat after small intraday moves.

### Fixed
- **`AI Trades Today` counter** used `DATE(executed_at) = DATE('now')` (UTC), which mis-counted across the IST midnight boundary. Now uses `DATE(executed_at, '+05:30') = DATE('now', '+05:30')`.
- **Daily kill-switch comparison** likewise switched to IST so "yesterday's close" is the actual previous IST trading-day close.
- **Stale Playground cron display** — the `AI Trader Status` card was showing `*/15 * * * 1-5` because the repo `.env` still had the old value. Bumped to `*/5 * * * 1-5` to match the actual cron registered by the scheduler (and the v1.2.0 default).
- **Trade tape `Horizon` blank for legacy AI BUYs** — kept rendering `—` as a deliberate "Pre-1.2 / unrecorded" placeholder; new BUYs always carry a horizon.

### Verified
- Migrations applied: `paper_trades` now has `horizon, ai_provider, ai_model, ai_upstream_model, ai_latency_ms`.
- `PLAYGROUND_CRON` resolved to `*/5 * * * 1-5` in the running container.
- Image rebuilt and redeployed. No type errors in `paper-trading.ts`, `ai.ts`, `playground.ts`, `Playground.tsx`, `LineCharts.tsx`.

## [1.2.0] — 2026-04-30
Cross-cap AI trading platform. Adds the **Arbiter** LLM gateway, a market-wide **Discovery** scanner, **IPO 12-hour cron** with rich AI verdicts, a **broadened 166-stock universe** (large → penny + ETFs), realtime auto-refresh, sortable tables across the app, and full per-call AI observability.

### Added
- **Arbiter LLM gateway** as a third provider (`AIProvider = 'Gemini' | 'OpenAI' | 'Arbiter'`) — OpenAI-compatible, default base URL `https://arbiter.chkoushik.com/v1`, default model `auto`. Sends a custom User-Agent (`FinPredict-AI/1.1 (+https://finpredict.chkoushik.com)`) so upstream Cloudflare WAF doesn't flag the OpenAI SDK's default UA.
- **AI fallback chain** — when the primary provider fails with a quota / rate-limit error and the primary is *not* already Arbiter, the call is retried against Arbiter automatically (controlled by `AI_FALLBACK_ENABLED`, default `true`).
- **Per-call AI observability** — every `aiComplete()` call now emits a structured Pino log line `AI ok → <provider>/<model> (routed: <upstream-model>) • <ms>ms • <caller>` with fields `{provider, model, upstreamModel, source, caller, ms, chars}`. Failures and fallbacks log similarly.
- **`GET /api/admin/ai/diag`** (Admin / Super Admin) returns the resolved AI config plus the last 100 AI calls (provider, upstream-model, latency, caller, ok/error). Backed by an in-memory ring buffer.
- **Discovery scanner** (`server/services/discovery.ts`) — sweeps the entire stock universe in batches of 5, AI-rates each name, and writes ranked opportunities to the `stock_opportunities` table (`stocks.tier`, conviction, entry/stop/target, horizon, thesis). Cron `0 */4 * * *`. Surfaced at `GET /api/discovery` and the new **Discovery** page (`src/pages/Discovery.tsx`).
- **IPO 12-hour pipeline** — cron `0 */12 * * *` plus boot warmup. `refreshIPOs()` pulls NSE upcoming issues, `analyseIPO()` returns `{recommendation, rating, risk_level, potential_pct, horizon, summary, strengths[], risks[], analyst_view}`. New `ipos` table; routes `GET /api/ipo`, `POST /api/ipo/refresh`, `POST /api/ipo/analyse/:id`. New IPO page renders star rating, verdict, risk badge, upside %, horizon, strengths/risks modal.
- **Broadened universe** — seed expanded from 16 NSE blue chips to **166 symbols** spanning large-cap → mid → small → penny + popular ETFs (`server/db/stock-seed.ts`). New `stocks.tier` column.
- **AI auto-trader uses cross-cap intelligence** — picks each cycle now drawn from `topBuyPicks() ∪ watchlist ∪ open holdings`, with `paper_trades.horizon` recorded on every BUY decision.
- **Realtime auto-refresh** (`src/lib/useAutoRefresh.ts`) — 30-second polling with pause-on-hidden across Portfolio / Playground / IPO / Discovery pages.
- **Sortable tables** (`src/components/SortableTable.tsx`) applied to Portfolio, Playground, IPO, and Discovery views.
- **Playground AI status card** showing the resolved provider/model and the last cycle's executed/error counters.
- **Playground manual run bypass** — "Run AI Cycle Now" now bypasses the NSE-hours and auto-trade gates so users can validate setup at any time.
- **Yahoo v8 chart fallback for live LTP** — `https://query1.finance.yahoo.com/v8/finance/chart/{SYM}.NS?interval=1d&range=2d` is used whenever Kite live quotes are unavailable (no market-data subscription on the connected Kite app). Logged as `Kite live quotes unavailable (no market-data subscription) — using Yahoo`.
- **Caller tags** on every AI call site (`discovery`, `paper-trader`, `predictions`, `ipo`, `chat`, `healthcheck`) so `/admin/ai/diag` and logs identify which subsystem made each call.

### Changed
- **`aiComplete()` signature** — adds `callerTag?: string`. Returns are unchanged.
- **`listIPOs()`** — listing query is resilient to non-ISO `close_date` strings; rows whose date can't be parsed but contain the current year are still surfaced.
- **NSE IPO ingest** — dates from NSE (`DD-MMM-YYYY`) are normalised to ISO `YYYY-MM-DD` on insert. A one-shot data migration converted existing rows.
- **Playground cron** changed from `*/15 * * * 1-5` to `*/5 1-5` (more responsive auto-trading inside market hours).
- **Equity-curve recompute** stays at 5 min.
- **Brokers page** — broker credentials prefill from `broker_accounts` so users don't re-paste keys after a session reset.
- **Cloudflare** — `Cache-Control: no-store` and `CDN-Cache-Control: no-store` on every API response so dynamic data isn't cached at the edge.

### Fixed
- **Empty IPO page** — root cause: NSE returns `DD-MMM-YYYY` but `listIPOs()` filtered using `DATE(close_date) >= …`, which silently returns NULL for non-ISO strings, dropping every row. Resolved by ingest-time normalisation + defensive listing query + DB migration.
- **Portfolio P&L** showing zero / NaN when Kite app lacks the paid market-data add-on — replaced with Yahoo v8 chart endpoint for LTP, restoring `current_value`, `pnl`, `pnl_pct`.
- **No visibility on which AI provider was actually used** — added per-call structured logs and `/admin/ai/diag` (see Added).
- **Discovery batch failures** (occasional `Expected ',' or ']' after array element in JSON …` and timeouts) are now isolated per-batch; one bad batch no longer aborts the whole scan.

### Verified
- Direct Arbiter call: HTTP 200, 2.9 s, routed to `gemini-2.5-flash-lite`.
- In-app probe via `aiComplete({callerTag:'probe'})`: 845 ms, routed to `openai/gpt-oss-120b`. Both calls visible in `/admin/ai/diag`.
- IPO listing now returns the single mainboard IPO NSE has scheduled (Onemi Technology Solutions / KISSHT, opens 2026-04-30, closes 2026-05-05, AI rating 3, NEUTRAL).
- Discovery scan: `scanned:56 written:51 errors:1`.
- 166-stock seed loaded; `stocks.tier` populated.
- Image rebuilt and `docker compose up -d finpredict` redeployed.

## [1.1.1] — 2026-04-29
Operational polish: docker-compose, enterprise typography, broker docs, AI quota friendliness.

### Added
- **`docker-compose.yml`** at the repo root with healthcheck, named volume, and `HOST_PORT` override (defaults to 3004 → 3000). Standard `docker compose up -d` / `down` workflow.
- **Zerodha Kite Connect setup guide** in README — exact Redirect URL / Postback URL values for `https://finpredict.chkoushik.com` and for local dev.
- **Reverse-proxy block** for Nginx in README.

### Changed
- **Typography** — global font stack switched to **IBM Plex Sans / Plex Mono / Plex Serif** (enterprise-finance grade, Bloomberg/Refinitiv-style). All numeric data now uses tabular lining figures (`tnum`, `lnum`) so columns of prices and P&L line up. `.col-header` rebuilt on Plex Sans 600 for clarity over the previous italic serif.
- **`.env` validation** — repo-shipped `.env` now passes the `min(16)` check on `JWT_SECRET` / `COOKIE_SECRET`. The previous `[REDACTED]` (14 chars) caused a startup failure; replaced with a 50-char composite secret.
- **Default Gemini model** corrected to `gemini-2.5-flash` (the earlier `gemini-3.1-flash-lite-preview` does not exist on Google's catalogue and would silently 404).
- **Top-Picks scanner** is now quota-friendly — capped at 8 candidates with a 13-second pace between AI calls, plus a 15-second back-off on `RESOURCE_EXHAUSTED`. Stays inside Gemini's 5-RPM free tier.

### Verified
- `docker compose build` clean, `docker compose up -d` reaches `healthy` in <20 s.
- All v1.1 smoke tests still pass on host port 3004.
- Gemini key authenticates: `POST /api/predictions/generate` for RELIANCE returned `direction=UP, expected=+2.36%, target=₹1398, confidence=0.70`.
- Top-Picks endpoint returns ranked picks (rate-limit-paced).

## [1.1.0] — 2026-04-28
Adds intelligent risk controls and a top-picks scanner; deploys cleanly on a single container.

### Added
- **Risk controls** in the paper-trader (`paper_accounts.stop_loss_pct`, `take_profit_pct`, `max_daily_loss_pct`, `max_position_pct`).
  - Defaults derived from `risk_level` (Conservative · Moderate · Aggressive).
  - Stop-loss / take-profit auto-evaluated **before** AI decisions each cycle.
  - Daily-loss kill-switch pauses AI for the session when breached.
  - Position-size cap per name based on `max_position_pct`.
  - Editable from Playground "AI Trading Settings".
- **Top-Picks Scanner** — `POST /api/predictions/top-picks?limit=N`. Runs Balanced-strategy analysis across the user's universe + watchlist, ranks by `confidence × expected_move`, and persists each pick as a normal prediction.
  - Surfaced via the **Find Top Picks** button on the Predictions page.
- **Portfolio-aware Chat** — when a user message references their portfolio (`my|portfolio|holding|position|should i`), the assistant prompt also includes their open positions, cash, and last 5 predictions.
- Container deployment guide with port `3004` published (host) → `3000` (container).
- New companion docs: `REQUIREMENTS.md`, `CHANGELOG.md`. README is now feature-cataloged.

### Changed
- README rewritten as the canonical product/feature reference.
- Playground "AI Trading Settings" panel surfaces all four risk knobs.
- AI cycle now logs the reason for each force-close in `paper_trades.ai_decision`.

### Fixed
- N/A (no regressions identified from v1.0.0).

### Verified
- Image `finpredict-ai:1.1` built (multi-stage, non-root `app:1000`).
- Container `finpredict-3004` running on host port `3004` → container `3000`.
- Smoke tests passed: health, SPA fallback, auth (register + me), 16 seeded stocks, 4 brokers (none enabled), playground state with new risk columns, strategies list, broker-gated trade (403), top-picks endpoint (200), settings round-trip with risk knobs persisted, `risk_level=Aggressive` auto-derives `33/12/40/8`, `run-ai` gated 403.

## [1.0.0] — 2026-04-28
Initial production-quality release. Complete rewrite from the previous prototype.

### Added
- **Server** (`server/`) — modular Express app:
  - `routes/` — auth, stocks, portfolio, watchlist, predictions, brokers, playground, chat, news, ipo, admin.
  - `services/` — ai (Gemini + OpenAI), prices (Yahoo), technicals (RSI/MACD/SMA/EMA/Bollinger), brokers (Kite live + 3 stubs), portfolio-sync, news, predictions, chat, paper-trading, config-store.
  - `jobs/scheduler.ts` — five node-cron jobs (AI trader, equity curve, prediction validation, news refresh, broker sync).
  - `middleware/` — auth, error-handler, validate, rate-limit.
  - Pino structured logging; `pino-pretty` in dev.
- **AI** — provider-agnostic three-tier resolution (`user_settings` → `configurations` → `process.env`), strict-JSON output sanitisation, real `models.list` for both Gemini & OpenAI.
- **Real KiteConnect** v3 OAuth (SHA-256 checksum POST to `/session/token`), 18 h soft expiry, holdings sync via SDK.
- **Predictions** — six strategies, four horizons, validation cron with horizon-based `validate_after`, accuracy KPIs.
- **Paper-trading playground** — virtual ₹100 000 account, transactional executor, equity curve, manual + AI trades, "Run AI Cycle Now" endpoint.
- **Frontend** (`src/`) — React 19 + Vite 6 + Tailwind 4 + Recharts + React Router 7:
  - Pages: `Auth (login + register)`, `Dashboard`, `Portfolio`, `Watchlist`, `Predictions`, `Playground`, `Chat`, `News`, `IPO`, `Brokers`, `Settings`, `Admin`, `Docs`.
  - Components: Button, Card/Stat/Badge, Field/Input/Select/Textarea, Modal, AppShell, charts (`LineSpark`, `AreaCurve`, `AllocationDonut`, `BarSeries`).
  - Lib: api client (`credentials: 'include'`), formatter (`Intl.NumberFormat('en-IN')`), AuthProvider, multi-toast queue.
  - Router: protected, admin-only and public-only route guards.
- **Database** (better-sqlite3) — 17 tables, WAL journal, `foreign_keys=ON`, idempotent migrations, 16 NSE blue-chip seeds.
- **Single-container Dockerfile** — multi-stage (builder for Vite + tsc, runtime image as non-root `app:1000`, tini, healthcheck on `/api/health`).
- **`.env.example`** documenting `JWT_SECRET`, `GEMINI_API_KEY`, `OPENAI_*`, `KITE_*`, `ALLOW_FIRST_ADMIN_REGISTRATION`, `PLAYGROUND_CRON`.
- End-to-end smoke test passing for `/api/health`, register-as-Super-Admin, login + me, stocks (16), brokers (4), playground (₹100 k auto-created), strategies (6), SPA fallback (`/portfolio` → 200), API 404, broker-gated trade (403).

### Security fixes (vs. legacy prototype)
- Removed `process.env.GEMINI_API_KEY` from `vite.config.ts` (no client leakage).
- Boot fails if `JWT_SECRET` < 16 chars.
- Cookies are `SameSite=Lax`; `Secure` only in prod.
- All SQL parameterised; FK + WAL enabled.
- AI/broker secrets never returned to the client.
- Rate-limit on `/api/auth/*`.
- Real bcrypt (12 rounds).

### Removed
- Legacy single-file `server.ts` and ad-hoc `db.ts` / `api.ts` from the previous prototype.
