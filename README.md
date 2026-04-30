# FinPredict-AI

> **AI-powered stock investment manager for Indian markets (NSE / BSE).**
> Self-hosted • single container • multi-broker • multi-AI-provider

This README is the canonical product/feature reference. Companion docs:
- [REQUIREMENTS.md](REQUIREMENTS.md) — functional & non-functional requirements
- [CHANGELOG.md](CHANGELOG.md) — version history

---

## Table of Contents
1. [What It Does](#what-it-does)
2. [Feature Catalogue](#feature-catalogue)
3. [Architecture](#architecture)
4. [Getting Started](#getting-started)
5. [Configuration](#configuration)
6. [API Surface](#api-surface)
7. [Security](#security)
8. [Deployment](#deployment)
9. [Roadmap](#roadmap)

---

## What It Does
FinPredict-AI is a complete, self-hosted investment terminal:
- Pulls live NSE/BSE prices and 100 days of OHLCV history without any paid API key (Yahoo v8 chart endpoint).
- Computes RSI · MACD · Bollinger Bands · SMA · EMA in real time.
- Runs your investment thesis through six classical investor lenses (Buffett, Lynch, Graham, Momentum, Mean-Reversion, Balanced) using **Google Gemini, any OpenAI-compatible LLM, or the Arbiter gateway** (auto-routing across providers).
- Every 4 hours, the **Discovery scanner** sweeps the entire 166-symbol cross-cap universe (large → penny + ETFs) and AI-ranks opportunities.
- Every 12 hours, the **IPO pipeline** pulls NSE upcoming issues and produces a structured AI verdict (rating, risk, upside %, horizon, strengths, risks, analyst consensus).
- Executes the AI's BUY / SELL / HOLD decisions in a virtual ₹1L paper-trading playground with risk controls, every 5 minutes during NSE hours.
- Syncs your real holdings from Zerodha Kite (and accepts credentials for Groww / Paytm Money / IND Stocks).
- Provides a portfolio-aware chat interface with live quote injection.
- Realtime auto-refresh + sortable tables across Portfolio / Playground / IPO / Discovery.
- Full per-call AI observability — structured logs and `/api/admin/ai/diag` show exactly which provider/model handled each request.
- **Installable PWA** — works as a standalone app on Android, iOS, Windows and macOS with offline shell, custom finance/AI logo and home-screen shortcuts (Playground / Predictions / Portfolio). Mobile-first responsive layout with a slide-in drawer and 5-item bottom nav.

---

## Feature Catalogue

### 1. Authentication & RBAC
- Username + password (bcrypt, 12 rounds), JWT in HTTP-only cookies (`SameSite=Lax`; `Secure` only in prod).
- Roles: **Viewer · Analyst · Admin · Super Admin**.
- First registered user requesting an admin role is auto-promoted to Super Admin (gated by `ALLOW_FIRST_ADMIN_REGISTRATION`).
- Rate-limited auth routes (30 req / 15 min per IP).
- Token TTL: 24 h.

### 2. Stocks, Live Prices & Technicals
- **166 NSE/BSE symbols** seeded on first boot, spanning large-cap → mid → small → penny stocks plus popular ETFs (`stocks.tier` column records the bucket).
- `Analyst+` can add new tickers.
- Endpoints:
  - `GET /api/stocks/:symbol/quote` — live LTP, day OHLC, 52-week H/L. Yahoo v8 chart endpoint (`/v8/finance/chart/{SYM}.NS`) used as the default no-key source; falls back gracefully if Kite live quotes are unavailable (no market-data subscription).
  - `GET /api/stocks/:symbol/history?days=90` — closing prices.
  - `GET /api/stocks/:symbol/technicals` — RSI(14), MACD(12,26,9), SMA(20/50/200), EMA(20), Bollinger(20, 2σ).
- NSE → `.NS`, BSE → `.BO` mapping handled internally.

### 3. Portfolio Tracking
- Manual add/remove or sync from any connected broker.
- Live enrichment: every row returns `invested_value`, `current_value`, `pnl`, `pnl_pct` using LTP at request time.
- Aggregate totals row.

### 4. Watchlist
- Star tickers with optional notes; cards show live LTP.
- Unique on `user_id + stock_id`.

### 5. AI Predictions Engine
- Six **strategies**: `Buffett · Lynch · Graham · Momentum · MeanReversion · Balanced`.
- Four **horizons**: Short (2-7 d), Medium (1 m), Long (3-12 m), Multi-Year.
- Each prediction synthesises live quote + 100 d history + technicals + recent news → strict JSON output.
- `validate_after` is set per horizon; an hourly cron labels pending predictions `ACCURATE` / `PARTIAL` / `FAILED`.
- KPIs: total · pending · accurate · failed · accuracy %. Sortable by date or expected move.

### 6. Auto-Trading Playground (paper)
- Each user gets a virtual ₹1L account auto-created on registration.
- AI runs every 5 min during NSE hours (Mon-Fri 09:15-15:30 IST) **only if `auto_trade=ON` and at least one broker enabled**.
- The cycle's universe each tick = `topBuyPicks() ∪ watchlist ∪ open holdings` so the trader sees fresh Discovery opportunities, not just a fixed list. The Playground UI shows the **effective** universe, not just the manual shortlist.
- **Market-regime detector** runs at the start of every cycle (`detectMarketRegime`): median 20-bar return + breadth across the universe → `Bullish` / `Bearish` / `Sideways`. The regime + a regime-appropriate playbook hint is fed to the LLM so strategy adapts dynamically (trend-follow in bull, mean-revert in chop, defensive in selloffs).
- AI receives universe + positions + cash + strategy + risk-level + market regime **+ per-symbol technicals (RSI/MACD/SMA/EMA/Bollinger) + 30 last candles + per-symbol news + macro headlines + recent predictions + sector mix + position weights + today's drawdown + closed-trade strategy P&L** → returns `{decisions:[{symbol, side, quantity, horizon, strategy_tag, conviction, reason}]}`. Persisted columns on every trade: `horizon`, `strategy_tag`, `realized_pnl` (on SELLs), `market_regime`, `ai_provider`, `ai_model`, `ai_upstream_model`, `ai_latency_ms`.
- **Closed-loop strategy learning** — `getStrategyStats()` aggregates realised P&L per `(strategy_tag, horizon)` from closed SELLs. Surfaced as the **Strategy Performance** card and `GET /api/playground/strategy-stats`. Same data is fed back into the next AI prompt as feedback so the model biases toward playbooks that have actually worked on this account.
- **Anti-fixation guard** — the AI cannot BUY the same symbol more than once within a 60-minute rolling window. Server-enforced.
- **Manual Trade modal** — shows live LTP, available cash, held qty, gross/fee/net cost preview, max-affordable-shares hint. Includes Horizon, Strategy tag and Reason/thesis fields. BUY is hard-blocked when net cost > available cash, SELL beyond held qty. Backed by `GET /api/playground/quote/:symbol`.
- Execution: 0.1 % fees, transactional, position upsert, cash-balance check.
- **Equity curve P&L colouring** — Recharts area uses a Y-axis-aligned green→red gradient pivoted on starting capital, with a dashed reference line. Above-baseline = green, below-baseline = red.
- AI Trader Status card shows the resolved **provider/model**, the last cycle's `executed` / `errors` counters, and a **daily P&L vs kill-switch** progress bar.
- **Tooltips on every input** — `Field` component renders a `?` icon next to each label; hover shows a long-form explanation of what the field controls and how it affects the AI.
- **Trade tape tooltip** — hover the symbol cell to see side/qty/price, horizon, strategy tag, regime at trade time, realised P&L, AI provider/model/upstream/latency, and the full reason. Strategy and Realised P&L are also rendered as columns.
- All POST endpoints enforce `requireBroker(userId)` → 403 unless ≥ 1 broker is enabled.

### 7. AI Chat
- Multi-session sidebar with auto-titled sessions.
- Live ticker injection: any uppercase symbol token in your message is auto-resolved to a live quote.
- **Portfolio-aware** — when the user's question references their portfolio, the assistant also receives open positions + cash + recent predictions as context.
- All messages persisted.

### 8. News Aggregator
- Primary: NewsAPI.org (`NEWSAPI_KEY` optional).
- Fallback: Google News RSS — works without any key.
- Cron pulls headlines every 30 min.

### 9. IPO Calendar + AI Analysis (12-hour cron)
- `GET /api/ipo` lists upcoming / active mainboard IPOs (date-normalised to ISO).
- A 12-hour cron + boot warmup runs `refreshIPOs()` → pulls NSE upcoming issues → AI-analyses any new or stale (>24 h) entries.
- `POST /api/ipo/refresh` triggers an on-demand refresh; `POST /api/ipo/analyse/:id` re-runs analysis for one IPO.
- AI verdict (per IPO): `recommendation` ∈ {SUBSCRIBE, AVOID, NEUTRAL}, `rating` 0–5, `risk_level`, `potential_pct`, `horizon`, `summary`, `strengths[]`, `risks[]`, `analyst_view`.
- IPO page renders star rating, verdict badge, risk badge, upside %, horizon, and a strengths/risks modal.

### 9b. Discovery Scanner (every 4 h)
- `server/services/discovery.ts` sweeps the full universe in batches of 5 (max 60 / scan), AI-rates each name, and writes ranked opportunities to `stock_opportunities` (`tier`, conviction, entry/stop/target, horizon, thesis).
- Cron `0 */4 * * *` plus boot warmup. Surfaced at `GET /api/discovery` and the **Discovery** page (sortable).
- Per-batch failures are isolated — one bad batch does not abort the scan.

### 10. Multi-Broker Connectivity
- **Zerodha Kite** — fully integrated (real OAuth v3, SHA-256 checksum, 18 h soft expiry, holdings sync via KiteConnect SDK).
- **Groww · Paytm Money · IND Stocks** — credentials accepted and broker is marked enabled (gating playground); live holdings sync currently throws a "use CSV import" message.
- Brokers page detects `?request_token=` redirect and finishes Kite OAuth automatically.

### 11. Per-User AI Override + Multi-Provider Routing
- Three providers supported: **Gemini**, **OpenAI** (any OpenAI-compatible base URL — Azure OpenAI / vLLM / OpenRouter / etc.), and **Arbiter** (default base `https://arbiter.chkoushik.com/v1`, model `auto`, auto-routes across upstream models per request).
- System default = admin-configured provider + key (DB `configurations` table).
- Each user can override on **Settings**: provider, model, API key, base URL.
- Resolution order: `user_settings` → `configurations` → `process.env`.
- **Quota fallback** — if the primary fails with a 429 / quota error and is *not* already Arbiter, the call is automatically retried against Arbiter (toggle: `AI_FALLBACK_ENABLED`, default `true`).
- **Per-call observability** — every `aiComplete()` emits a structured Pino log: `AI ok → <provider>/<model> (routed: <upstream-model>) • <ms>ms • <caller>`.
- **`GET /api/admin/ai/diag`** (Admin / Super Admin) returns the resolved config + the last 100 AI calls with provider, upstream-model, latency, caller, ok/error.
- "Test Connection" button does a 1-token live ping.

### 12. Risk Controls (Intelligent — v1.1)
The paper-trader respects four risk knobs per user:
| Setting | Default | Effect |
|---|---|---|
| `max_position_pct` | 20 % | Hard cap on single-position weight (% of total equity). |
| `stop_loss_pct` | 8 % | If unrealised loss ≥ this %, AI cycle force-closes. |
| `take_profit_pct` | 25 % | If unrealised gain ≥ this %, AI cycle harvests. |
| `max_daily_loss_pct` | 5 % | If today's drawdown ≥ this, AI is paused for the session (kill-switch). |
- Defaults derived from `risk_level` (Conservative · Moderate · Aggressive).
- Editable from Playground "AI Trading Settings" panel.
- Stop-loss / take-profit evaluated **before** AI decisions each cycle; kill-switch evaluated first.

### 13. Top-Picks Scanner (Intelligent — v1.1)
`POST /api/predictions/top-picks` runs Balanced-strategy analysis on the user's playground universe + watchlist (deduped) and returns the top N (default 5) ranked by `confidence × expected_move`. Each pick is also persisted as a normal prediction so it appears in history & is auto-validated. Surfaced via the **"Find Top Picks"** button on the Predictions page.

### 14. Admin Console
Tabs:
- **Config** — live-edit `configurations` rows grouped by category. Sensitive keys masked.
- **AI** — "Test System AI" runs a JSON ping; "Fetch Models" calls the provider's `models.list`.
- **Users** — list & create.
- **Logs** — last 100 sync-log rows.

### 15. Background Jobs
| Cron | Job |
|------|-----|
| `*/5 * * * 1-5` (configurable via `PLAYGROUND_CRON`) | AI auto-trader cycle |
| `*/5 * * * *` | Recompute equity curve |
| `0 * * * *` | Validate due predictions |
| `*/30 * * * *` | Refresh news cache |
| `0 */4 * * *` | Discovery scanner (cross-cap AI ranking) |
| `0 */12 * * *` | IPO refresh + AI analysis |
| `0 */6 * * *` | Sync broker holdings |

All long-running jobs (Discovery, IPO) also run a **boot warmup** so the first batch of data is ready shortly after a fresh deploy.

---

## Architecture
Single container hosting a Vite-built SPA (`dist/`) plus an Express API on one port:

```
React 19 + Vite 6 + Tailwind 4 + Recharts + React Router 7
                |
                v   (same origin)
Express 4 — routes/ services/ jobs/ middleware/
                |
                v
better-sqlite3 (WAL, FK ON)  data/finance.db
                |
   ┌────────────┼─────────────┐
   v            v             v
Yahoo v8 chart  Gemini /     KiteConnect v3
(free)          OpenAI /     OAuth + holdings
                Arbiter LLM  (Yahoo fallback when
                             market-data sub absent)
   |
NewsAPI / Google News RSS
```

---

## Getting Started

### Local
```bash
cp .env.example .env          # required: JWT_SECRET (>= 16 chars)
npm install
npm run build
npm start                     # http://localhost:3099
```

### Docker
```bash
docker build -t finpredict-ai:latest .
docker run -d --name finpredict \
  -p 3004:3000 \
  -v finpredict-data:/app/data \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e GEMINI_API_KEY=…           \
  finpredict-ai:latest
```

### Docker Compose (recommended)
A `docker-compose.yml` is checked in. With your `.env` populated, just:

```bash
docker compose up -d --build      # build + start (port 3004)
docker compose ps                 # check health
docker compose logs -f finpredict # tail logs
docker compose restart            # apply env changes
docker compose down               # stop & remove (data volume kept)
docker compose down -v            # also wipe the SQLite volume
```

Override the host port without editing the file:
```bash
HOST_PORT=8080 docker compose up -d
```

The container always listens on `3000` internally; Compose maps `${HOST_PORT:-3004}` → `3000`. SQLite lives in the `finpredict-data` named volume, so upgrades preserve users / trades / equity history.

### Behind a reverse proxy (e.g. Nginx → `https://finpredict.chkoushik.com`)
Forward host port `3004` to the public domain. Sample Nginx block:
```nginx
location / {
  proxy_pass http://127.0.0.1:3004;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```
Set `APP_URL=https://finpredict.chkoushik.com` in `.env` so the server emits the right absolute URLs.

### Zerodha Kite Connect — App Setup

When you create the Kite Connect app at https://developers.kite.trade/apps, fill in **exactly**:

| Kite field | Value | Notes |
|-----------|-------|-------|
| **App name** | FinPredict AI | any label |
| **App type** | `Connect` | (not Publisher) |
| **Redirect URL** | `https://finpredict.chkoushik.com/brokers` | Kite redirects browsers here with `?request_token=...&action=login&status=success`. The Brokers page detects this query string and auto-calls the token-exchange endpoint. |
| **Postback URL** | `https://finpredict.chkoushik.com/api/brokers/kite/postback` *(optional)* | Used for live order updates. Leave blank if you only need login + portfolio sync. |
| **Description** | anything | – |

Local development (no public domain yet)? Use `http://localhost:3004/brokers` — Kite accepts plain `http` only on `localhost`.

After saving the app, copy **API key** and **API secret** into the FinPredict **Brokers** page → click **Save** → click **Login with Kite** → approve on Zerodha. The token exchange completes automatically and the broker turns green.

> Token lifetime: Zerodha tokens expire daily at ~07:30 IST. Re-login from the Brokers page each morning before using the Playground.

### First-run flow
1. Visit `/` → register the first admin (auto-Super-Admin).
2. **Brokers** → connect Zerodha Kite (API key + secret → Login → token exchanged automatically).
3. **Playground** unlocks; toggle **Auto-trade ON**.
4. Optionally override the AI in **Settings** with your own key.

---

## Configuration
All knobs live in `.env` (Zod-validated at boot). See `.env.example`. Highlights:

| Var | Required | Description |
|-----|----------|-------------|
| `JWT_SECRET` | yes | Signing key (≥ 16 chars) |
| `COOKIE_SECRET` | yes | Cookie signing (≥ 16 chars) |
| `GEMINI_API_KEY` | * | Gemini provider |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | * | OpenAI-compatible provider |
| `ARBITER_API_KEY` / `ARBITER_BASE_URL` / `ARBITER_MODEL` | * | Arbiter gateway (default `https://arbiter.chkoushik.com/v1`, model `auto`) |
| `DEFAULT_AI_PROVIDER` | – | One of `Gemini` / `OpenAI` / `Arbiter` |
| `DEFAULT_AI_MODEL` | – | Overrides per-provider default |
| `AI_FALLBACK_ENABLED` | – | Default `true`. Auto-retry on Arbiter when primary hits quota |
| `KITE_API_KEY` / `KITE_API_SECRET` | – | Optional system-wide Kite default |
| `NEWSAPI_KEY` | – | Falls back to Google News RSS |
| `ALLOW_FIRST_ADMIN_REGISTRATION` | – | `true` once for bootstrap |
| `PLAYGROUND_CRON` | – | Default `*/5 * * * 1-5` |
| `DB_PATH` | – | Default `data/finance.db` |
| `PORT` | – | Default `3000` |

\* At least one AI provider key is required for predictions / chat / IPO / Discovery analysis. Arbiter alone is sufficient.

---

## API Surface
All routes are under `/api/*`, JSON, cookie-auth:

```
GET  /health
POST /auth/register        POST /auth/login        GET /auth/me        POST /auth/logout

GET  /stocks               POST /stocks
GET  /stocks/:s/quote      GET /stocks/:s/history     GET /stocks/:s/technicals

GET  /portfolio            POST /portfolio            DELETE /portfolio/:id
GET  /watchlist            POST /watchlist            DELETE /watchlist/:id

GET  /predictions          GET /predictions/strategies   GET /predictions/accuracy
POST /predictions/generate POST /predictions/validate    POST /predictions/top-picks   * v1.1

GET  /brokers              POST /brokers/credentials
GET  /brokers/:b/login-url POST /brokers/:b/exchange-token
POST /brokers/:b/sync      POST /brokers/sync-all       DELETE /brokers/:b

GET  /playground/          GET /playground/trades       GET /playground/equity-curve
GET  /playground/strategy-stats   GET /playground/quote/:symbol
POST /playground/reset     POST /playground/settings
POST /playground/trade     POST /playground/run-ai

GET  /chat/sessions        GET /chat/sessions/:id       POST /chat/send

GET  /news                 GET /ipo                     POST /ipo/refresh
POST /ipo/analyse/:id

GET  /discovery            POST /discovery/scan

# admin only
GET  /admin/config         POST /admin/config
GET  /admin/ai/test        GET /admin/ai/models         GET /admin/ai/diag
GET  /admin/users          POST /admin/users
GET  /admin/sync/logs

# any authenticated user
GET  /admin/me/ai          POST /admin/me/ai            POST /admin/me/ai/test
```

---

## Security
- Helmet · express-rate-limit · zod-validated bodies · bcrypt-12 · cookie `SameSite=Lax` (`Secure` in prod) · CORS with credentials.
- AI/broker secrets stored in DB never returned to the client; only the *configured* boolean is exposed.
- All SQL is parameterised (better-sqlite3 prepared statements).
- No client-side `process.env` leakage from Vite.

## Deployment
- **Single container, single port.** Reverse-proxy `/` from the host nginx to container `:3000`.
- Persist `/app/data` as a named volume.
- Container runs as non-root `app:1000`.
- Healthcheck pings `/api/health` every 30 s.

## Roadmap
- CSV import for Groww / Paytm / IND Stocks
- WebSocket live ticks (Kite)
- Mobile-first responsive polish
- Real-money order routing behind a feature flag (out of scope for v1)
- Code-splitting to drop main bundle below 250 kB gzip
