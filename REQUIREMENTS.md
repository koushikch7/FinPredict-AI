# Requirements — FinPredict-AI

Companion to [README.md](README.md) and [CHANGELOG.md](CHANGELOG.md). This document captures the *system, functional and non-functional* requirements that the implementation must satisfy.

## 1. System Requirements

### 1.1 Runtime
| Item | Requirement |
|------|-------------|
| Node.js | 20.x LTS (tested on 20.19.5) |
| npm | ≥ 10.x |
| OS | Linux x86_64 / arm64 (Alpine in-container) |
| Disk | ≥ 1 GB free for image + DB + WAL |
| RAM | ≥ 512 MB (container running idle ≈ 130 MB RSS) |
| Port | One TCP port (default `3000` in container) |

### 1.2 Build-time
- Python 3, `make`, `g++` for `better-sqlite3` native build (auto-handled by the Alpine builder stage).
- Internet access for `npm ci` (registry), `apk add` (system deps), and to pull the Node base image.

### 1.3 External services (optional but recommended)
| Service | Purpose | Required? |
|---|---|---|
| Google AI Studio (Gemini) | LLM provider | one of {Gemini, OpenAI, Arbiter} required |
| OpenAI / Azure OpenAI / vLLM / OpenRouter | OpenAI-compatible alternative | one of {Gemini, OpenAI, Arbiter} required |
| **Arbiter gateway** (`https://arbiter.chkoushik.com/v1`) | OpenAI-compatible multi-model gateway, auto-routes per request | one of {Gemini, OpenAI, Arbiter} required — **recommended primary** |
| Yahoo Finance v8 chart endpoint | Live quotes & history | yes (no key needed) |
| Zerodha Kite developer app | Live broker integration | required if user wants real holdings sync (paid market-data sub *not* required — Yahoo is used as LTP fallback) |
| NewsAPI.org | Headlines | optional — Google News RSS used otherwise |
| NSE upcoming-issues feed | IPO calendar | optional |

## 2. Functional Requirements

### 2.1 Authentication & Authorisation
- FR-A1 The system **must** allow self-registration via `POST /api/auth/register`.
- FR-A2 The first user requesting an admin role **must** be auto-promoted to Super Admin if no admin exists *and* `ALLOW_FIRST_ADMIN_REGISTRATION=true`.
- FR-A3 Passwords **must** be hashed with bcrypt cost ≥ 12 before persistence.
- FR-A4 Sessions **must** be JWT-based, transported in HTTP-only cookies with `SameSite=Lax`. `Secure` flag **must** be set in production.
- FR-A5 The system **must** rate-limit `/api/auth/*` to 30 requests / 15 min per IP.
- FR-A6 Roles `Viewer < Analyst < Admin < Super Admin` **must** be enforced server-side via the `authorize(roles[])` middleware.

### 2.2 Stocks & Market Data
- FR-S1 Live quotes **must** be retrievable for any seeded ticker without a paid API.
- FR-S2 Historical OHLCV (≥ 100 days) **must** be retrievable via `/api/stocks/:s/history`.
- FR-S3 Technical indicators **must** include RSI(14), MACD(12,26,9), SMA(20/50/200), EMA(20), Bollinger(20, 2σ).
- FR-S4 Symbol mapping for NSE→`.NS` and BSE→`.BO` **must** be applied transparently.
- FR-S5 The seed universe **must** contain at least 150 symbols spanning large-cap, mid, small, penny stocks, and ETFs (`stocks.tier` populated for each).
- FR-S6 If Kite live quotes are unavailable (e.g. no paid market-data subscription), the system **must** transparently fall back to Yahoo's v8 chart endpoint and log the substitution once per cycle.

### 2.3 Portfolio
- FR-P1 Each user **must** see only their own positions (`user_id` scope on every query).
- FR-P2 Holdings **must** be enriched with `current_value`, `pnl`, `pnl_pct` derived from a live LTP fetched at request time.
- FR-P3 The Sync Brokers action **must** upsert positions transactionally and log to `sync_logs`.

### 2.4 Watchlist
- FR-W1 The combination `(user_id, stock_id)` **must** be unique.
- FR-W2 Watchlist responses **must** include the latest LTP.

### 2.5 Predictions
- FR-PR1 The system **must** support six strategies: Buffett, Lynch, Graham, Momentum, MeanReversion, Balanced.
- FR-PR2 The system **must** support four horizons: 2-7d, 1m, 3-12m, LT.
- FR-PR3 The AI response **must** parse to strict JSON; markdown fences **must** be stripped.
- FR-PR4 `validate_after` **must** be set per horizon at creation time.
- FR-PR5 An hourly cron **must** label `PENDING` predictions whose `validate_after` has elapsed as `ACCURATE` / `PARTIAL` / `FAILED`.
- FR-PR6 `POST /api/predictions/top-picks` **must** rank candidates by `confidence × expected_move_p` and persist each as a normal prediction.

### 2.6 Auto-Trading Playground
- FR-PG1 Each new user **must** receive a virtual ₹100 000 paper account on registration.
- FR-PG2 Trade endpoints **must** return HTTP 403 unless `brokerStore.hasAnyEnabled(userId) === true`.
- FR-PG3 Trades **must** charge 0.1 % fees and reject if cash is insufficient.
- FR-PG4 The AI cycle **must not** run when NSE is closed (`isNseOpen()`), nor when `auto_trade=OFF`. The **manual** "Run AI Cycle Now" button **may** bypass these gates so users can validate setup at any time.
- FR-PG5 The AI cycle **must** evaluate, in order:
  1. Daily-loss kill-switch (compare `total_today` to last session close, both anchored to IST midnight).
  2. Stop-loss / take-profit on each open position.
  3. AI BUY/SELL/HOLD decisions, capped at `max_position_pct` per name.
- FR-PG6 The equity curve **must** be recomputed every 5 minutes for every paper account.
- FR-PG7 The user **must** be able to reset the account with a chosen starting capital ≥ ₹1 000.
- FR-PG8 Per cycle, the AI's universe **must** be `topBuyPicks() ∪ watchlist ∪ open holdings`.
- FR-PG9 Every BUY decision **must** persist a `horizon` value on `paper_trades` (`Intraday` / `Short-term` / `Long-term`).
- FR-PG10 Every AI-decided trade **must** persist `ai_provider`, `ai_model`, `ai_upstream_model`, `ai_latency_ms` on `paper_trades` for full attribution.
- FR-PG11 The trader **must not** BUY the same symbol more than once within a rolling 60-minute window (anti-fixation guard, server-enforced).
- FR-PG12 The AI prompt **must** include per-symbol technicals, recent candles, per-symbol news, macro headlines, recent prediction history, sector mix, position weights, and the current daily drawdown vs the kill-switch threshold.
- FR-PG13 "AI trades today" counters **must** use the IST midnight boundary, not UTC.
- FR-PG14 Every SELL **must** persist `realized_pnl = (sell_price − avg_cost) × qty − fees` on `paper_trades` so closed-trade P&L can be attributed.
- FR-PG15 Every trade (manual or AI) **must** persist a `strategy_tag` and `market_regime`. AI trades use the regime detected by `detectMarketRegime()` and the LLM-supplied strategy tag; manual trades use values supplied by the user (defaults `strategy_tag='manual'`).
- FR-PG16 The system **must** detect the market regime each AI cycle from the median 20-bar return + breadth across the candidate universe, classify as `Bullish | Bearish | Sideways`, and inject both the regime and a regime-appropriate playbook hint into the AI system prompt.
- FR-PG17 Closed-trade strategy P&L (per `(strategy_tag, horizon)`) **must** be exposed at `GET /api/playground/strategy-stats` and fed back into the AI prompt as a feedback signal.
- FR-PG18 The Manual Trade UI **must** display live LTP, current cash, and currently-held quantity, and **must** prevent submission when a BUY would exceed available cash or a SELL would exceed held quantity. The server **must** enforce the same guards.
- FR-PG19 The Manual Trade form **must** require a Horizon and accept an optional Strategy tag and Reason/thesis; both are persisted with the trade.
- FR-PG20 The equity-curve chart **must** colour the area green where the value is above the starting capital and red where it is below, with a visible reference line at the starting-capital baseline.
- FR-PG21 Every input field in the Playground **must** carry a `?` info-icon tooltip explaining what the field controls.
- FR-PG22 The Trade Tape symbol cell **must** expose a hover tooltip containing side/qty/price, horizon, strategy tag, market regime at trade time, realised P&L (when applicable), AI provider/model/upstream/latency (when AI), and the full reason.
### 2.7 Chat
- FR-C1 The system **must** persist all messages with role and timestamp.
- FR-C2 Any uppercase symbol token in the user's message **must** be enriched with a live quote in the LLM prompt.
- FR-C3 If the message references the user's portfolio (heuristic: `my|portfolio|holding|position|should i`), the LLM context **must** also include the user's open positions, cash, and last 5 predictions.

### 2.8 Brokers
- FR-B1 At minimum, **Zerodha Kite** **must** be live-integrated end-to-end (API-key save, login URL, token exchange, holdings sync, hourly auto-sync).
- FR-B2 Other brokers (Groww, Paytm Money, IND Stocks) **may** be marked enabled and gate the playground without live sync.
- FR-B3 Broker secrets **must never** be returned in API responses.

### 2.9 IPO / News / Discovery
- FR-N1 News pull **must** function without any paid key (Google News RSS fallback).
- FR-IP1 IPO list **must** proxy NSE upcoming issues; the AI verdict **must** include `recommendation ∈ {SUBSCRIBE, AVOID, NEUTRAL}`, `rating` 0–5, `risk_level`, `potential_pct`, `horizon`, `summary`, `strengths[]`, `risks[]`, `analyst_view`.
- FR-IP2 IPO ingest **must** normalise dates from any reasonable upstream format (`DD-MMM-YYYY`, `DD/MM/YYYY`, ISO) to ISO `YYYY-MM-DD` before storage.
- FR-IP3 An IPO refresh + analysis cron **must** run every 12 hours, plus a boot warmup.
- FR-DS1 A Discovery scanner **must** sweep the full universe in batches every 4 hours and persist ranked opportunities to `stock_opportunities`.
- FR-DS2 Per-batch failures during a scan **must not** abort the whole scan.

### 2.10 AI Provider Routing & Observability
- FR-AI1 The system **must** support three providers: `Gemini`, `OpenAI` (any OpenAI-compatible base URL), and `Arbiter`.
- FR-AI2 AI configuration resolution order **must** be `user_settings` → `configurations` → `process.env`.
- FR-AI3 When the primary AI call fails with a quota/rate-limit error and the primary is **not** Arbiter, the call **must** be retried against Arbiter (toggle: `AI_FALLBACK_ENABLED`).
- FR-AI4 Every `aiComplete()` call **must** emit a structured Pino log line with at minimum: `provider`, `model`, `upstreamModel`, `source`, `caller`, `ms`, success/failure.
- FR-AI5 An admin-only `GET /api/admin/ai/diag` endpoint **must** return the resolved AI config plus the most recent N (≥ 100) AI calls for diagnostics.
- FR-AI6 OpenAI-compatible calls **must** send a non-default User-Agent (`FinPredict-AI/...`) so upstream WAFs (e.g. Cloudflare) do not flag the SDK's default UA.

### 2.10 Admin
- FR-AD1 Only `Admin` / `Super Admin` **must** access `/api/admin/config`, `/users`, `/sync/logs`, `/ai/test`, `/ai/models`, `/ai/diag`.
- FR-AD2 Per-user AI override (`/admin/me/ai`) **must** be available to **any** authenticated user.

## 3. Non-Functional Requirements

### 3.1 Performance
- NFR-P1 Server cold-start to listening on `$PORT` ≤ 3 s on the reference container.
- NFR-P2 `/api/health` round-trip ≤ 50 ms p99 (no DB query).
- NFR-P3 An AI prediction **must** complete in ≤ 60 s (timeout enforced) with at most one retry-on-empty.

### 3.2 Security (OWASP-aligned)
- NFR-S1 No secret value (AI key, broker secret, JWT) **must** be sent to the client.
- NFR-S2 No `process.env` value **must** be embedded in the Vite client bundle.
- NFR-S3 SQL **must** use parameterised statements only.
- NFR-S4 CORS **must** specify an explicit origin policy and allow credentials only via `cors({origin: true, credentials: true})` (same-origin model).
- NFR-S5 The boot **must** fail if `JWT_SECRET` length < 16.
- NFR-S6 Bodies **must** be validated by Zod schemas; failures return 400 with structured `issues`.

### 3.3 Reliability
- NFR-R1 SQLite **must** run with WAL journal, `synchronous=NORMAL`, `foreign_keys=ON`.
- NFR-R2 Migrations **must** be idempotent and run on every boot.
- NFR-R3 The cron scheduler **must** survive a missed tick (no compounding) — each job is single-execution per user/account.

### 3.4 Observability
- NFR-O1 Pino structured JSON logs in production; `pino-pretty` in development.
- NFR-O2 Sync events (broker, news, AI) **must** be persisted to `sync_logs` with `service`, `status`, `message`, `timestamp`.
- NFR-O3 A `/api/health` endpoint **must** return `{ok, env, ts}` without DB access.
- NFR-O4 Every AI call **must** be observable in logs and via `/api/admin/ai/diag` (provider, model, upstream-model, latency, caller, ok/error).

### 3.5 Portability
- NFR-PT1 The whole product **must** ship as one OCI image, < 600 MB compressed.
- NFR-PT2 No external orchestration (no Redis / Postgres) is required.
- NFR-PT3 The data path **must** be a single directory (`/app/data`) for backup.

### 3.6 Compliance
- NFR-CO1 Indian timezone for all market-hour and date displays (`Asia/Kolkata`).
- NFR-CO2 Currency formatting via `Intl.NumberFormat('en-IN', {currency: 'INR'})`.

## 4. Data Requirements

| Table | Purpose | Notable indexes |
|-------|---------|-----------------|
| `users` | accounts | unique `username` |
| `stocks` | seeded + user-added tickers | unique `symbol` |
| `stock_prices` | snapshot history | `(stock_id, ts)` |
| `portfolio` | holdings | unique `(user_id, stock_id)` |
| `watchlist` | starred tickers | unique `(user_id, stock_id)` |
| `predictions` | AI outputs + validation | `(user_id, stock_id)`, `(status, validate_after)` |
| `feature_reliability` | per-feature accuracy | – |
| `configurations` | system k/v | unique `key` |
| `user_settings` | per-user overrides | unique `(user_id, key)` |
| `broker_accounts` | per-user broker credentials | unique `(user_id, broker)` |
| `sync_logs` | broker / news / AI logs | – |
| `news_articles` | cached headlines | `(symbol, published_at)` |
| `chat_sessions`, `chat_messages` | chat | `(session_id, created_at)` |
| `paper_accounts`, `paper_positions`, `paper_trades`, `paper_equity_curve` | playground (`paper_trades.horizon`) | `(user_id)` everywhere |
| `ipos` | IPO calendar + AI verdict | unique `(name, COALESCE(open_date,''))` |
| `stock_opportunities` | Discovery scanner output | `(symbol, ts)` |

## 5. Acceptance Criteria
1. `npm run typecheck` returns clean.
2. `npm run build` produces a valid `dist/`.
3. `npm start` boots and `/api/health` returns 200 within 5 s.
4. `docker build` succeeds; container exposes the configured port and survives a `docker stop && docker start`.
5. End-to-end smoke test (registration → login → stocks → brokers → playground → SPA fallback) passes.
6. Trying to trade without a broker enabled returns HTTP 403.
7. The first registered admin becomes Super Admin (idempotent — second admin registration is denied if one already exists).

## 6. Out of Scope (v1)
- Real-money order routing.
- Mobile native apps.
- Multi-tenant org/team accounts.
- Algorithmic backtesting beyond paper-trade replay.
