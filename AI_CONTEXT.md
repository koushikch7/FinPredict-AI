# AI_CONTEXT.md — FinPredict AI

> **Purpose of this file:** Complete session context for any AI assistant (Claude, GPT, Gemini, etc.) picking up work on this codebase. Read this before asking any questions. Update the "Session Log" section at the end of every work session.

---

## What Is FinPredict AI

FinPredict AI is a **full-stack Indian stock market paper-trading platform** with AI-driven buy/sell decisions. It provides a playground where users can paper-trade NSE/BSE stocks using virtual money, with an AI trader that runs on a cron schedule during market hours.

- **Live URL:** `https://finpredict.chkoushik.com`
- **Server:** `[REDACTED-HOST]` (SSH as `[REDACTED-SSH-ENDPOINT]`)
- **Container:** `finpredict` (Docker, port 3004→3000)
- **Source:** `/var/www/html/FinPredict-AI/` · GitHub: `github.com/koushikch7/FinPredict-AI` (branch: `main`)
- **Current version:** `1.6.1`
- **Stack:** React (Vite, TypeScript) + Express (tsx, TypeScript) + SQLite (better-sqlite3) + Docker

---

## Architecture

```
Browser → nginx (HTTPS) → Docker container :3004
                              ↓
                    Express server (tsx server/index.ts)
                         ├── API routes (/api/*)
                         │     ├── /api/playground  ← AI paper trading
                         │     ├── /api/stocks       ← NSE/BSE stock data
                         │     ├── /api/predictions  ← AI price predictions
                         │     ├── /api/chat         ← AI chat assistant
                         │     ├── /api/news         ← Market news + FinBERT sentiment
                         │     ├── /api/discovery    ← Cross-cap AI opportunity scanner
                         │     └── /api/admin        ← Config, AI diag, backups
                         └── Frontend (dist/ built by Vite)
                               served as SPA from express.static
```

**Key files:**
| File | Purpose |
|------|---------|
| `server/index.ts` | Express app entry, middleware, route registration, background jobs |
| `server/routes/playground.ts` | Paper trading API: account, positions, manual trade, AI cycle trigger |
| `server/services/paper-trading.ts` | AI trader cycle logic, Kelly sizing, conviction scoring, risk controls |
| `server/services/ai.ts` | AI provider abstraction (Gemini/OpenAI/Arbiter), fallback chain, `resolveFallbackChain()` |
| `server/services/prices.ts` | Yahoo Finance quote/history fetch; `fetchYahooQuote()`, `fetchYahooHistory()`, `latestPrice()` |
| `server/services/predictions.ts` | AI-powered stock predictions with technical context |
| `server/services/sentiment.ts` | FinBERT sentiment scoring via HuggingFace |
| `server/jobs/scheduler.ts` | All cron jobs (AI trader every 5min NSE hours, equity curve, news, backup) |
| `server/config.ts` | Zod-validated environment config |
| `server/db/` | SQLite schema, migrations |
| `src/pages/Playground.tsx` | Paper trading UI (606 lines) |
| `.env` | All secrets and config (never commit) |

---

## Key Configuration (.env)

```env
DEFAULT_AI_PROVIDER=Arbiter
DEFAULT_AI_MODEL=auto        # "auto" = Arbiter routing; only valid for Arbiter/OpenAI gateway
ARBITER_API_KEY=arbiter-sk-...
ARBITER_BASE_URL=https://arbiter.chkoushik.com/v1
GEMINI_API_KEY=AIzaSy...     # fallback when Arbiter is down
PLAYGROUND_CRON=*/5 * * * 1-5  # every 5min, Mon-Fri only
KITE_API_KEY=74agvhxlij9kcf8w
KITE_API_SECRET=jsd86a4y8b2okeral5i5vxklwhrk3k9j
```

**Important:** `DEFAULT_AI_MODEL=auto` works for Arbiter (which supports routing via "auto") but is INVALID for the Gemini SDK. The `resolveFallbackChain()` in `server/services/ai.ts` substitutes `gemini-2.5-flash` when model is "auto" and provider is Gemini.

---

## AI Provider Priority

```
Primary:  Arbiter/auto  →  routes to best available free-tier model
Fallback: Gemini/gemini-2.5-flash  (when Arbiter times out at 60s)
```

The paper trader uses `timeoutMs: 60_000` for the AI call. Fallback chain is built in `resolveFallbackChain()` in `server/services/ai.ts`.

---

## Stock Data (Prices)

- **Primary:** Kite (Zerodha) — requires daily OAuth token renewal; API key/secret configured but access_token must be refreshed manually each day
- **Fallback:** Yahoo Finance `query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}.NS`
  - **User-Agent MUST be a real Chrome UA** — custom UAs like `Mozilla/5.0 FinPredict` get blocked/rate-limited from Docker container
  - Current UA: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36`
  - Host returns HTTP 429 quickly; container returns TCP timeout (8s) with custom UA
- **DB cache:** `latestPrice(stockId)` — used when both Kite and Yahoo fail

**Kite notes:** Portfolio sync works fine. Live quotes fail with "Incorrect api_key or access_token" until daily OAuth re-auth. Market data subscription (paid) required for live tick data — Yahoo is the reliable fallback.

---

## Background Jobs (scheduler.ts)

| Job | Schedule | What it does |
|-----|----------|-------------|
| AI Trader | `*/5 * * * 1-5` (NSE hours) | `runAITraderCycle()` for all users with `auto_trade=true` |
| Equity curve | `*/5 * * * *` | `recomputeEquity()` for all accounts |
| News refresh | `*/30 * * * *` | Fetch market news + FinBERT sentiment |
| Prediction validation | `0 * * * *` | Validate pending predictions against actual prices |
| IPO refresh | `0 */12 * * *` | AI-powered IPO analysis |
| Discovery scan | `0 */4 * * *` | Cross-cap opportunity scanner |
| Daily backup | `0 2 * * *` IST | OCI Object Storage (S3-compatible) |

---

## Playground Feature

The playground (`/playground`) is the AI paper-trading interface:

- Virtual account with configurable starting capital
- AI trader runs every 5 min during NSE hours (09:15–15:30 IST)
- Strategies: Buffett, Lynch, Graham, Momentum, MeanReversion, Balanced
- Risk levels: Conservative, Moderate, Aggressive
- Manual trade button — fetches live LTP via `/api/playground/quote/:symbol`
- Position sizing: Kelly criterion-inspired, with sector concentration caps (30%)
- Kill-switch: daily drawdown limit pauses AI for the day
- Charts: equity curve (AreaCurve), positions table (SortableTable)

**Key API endpoints:**
- `GET /api/playground` — full account state + AI status + positions with LTP
- `POST /api/playground/trade` — execute manual trade
- `GET /api/playground/quote/:symbol` — live LTP for trade modal
- `POST /api/playground/run-ai` — manually trigger AI cycle
- `POST /api/playground/settings` — update strategy/risk/universe

---

## Deployment

```bash
# After code change (files are baked into Docker image from server/ dir)
docker cp /var/www/html/FinPredict-AI/server/routes/playground.ts finpredict:/app/server/routes/playground.ts
docker restart finpredict
# OR full rebuild:
cd /var/www/html/FinPredict-AI && docker compose up --build -d

# Logs
docker logs finpredict --since 10m

# Health
curl -s http://localhost:3004/api/health
```

**Note:** `docker cp` + restart is fastest for single-file changes. Full rebuild takes ~2 min.

**Git workflow:**
```bash
cd /var/www/html/FinPredict-AI
git add server/<file>
git commit -m "type(scope): description"
git push origin main
```

---

## Known Issues / Open Items

- **Kite daily OAuth** — access_token expires daily; requires manual browser-based OAuth re-auth. Until re-authed, portfolio sync fails and live quotes fall back to Yahoo.
- **Kite market data subscription** — even with valid token, live quotes return "no market-data subscription" error. Yahoo Finance is the reliable quote source.
- **Arbiter occasional 60s timeouts** — paper-trader uses `timeoutMs: 60_000`. When Arbiter is slow, AI cycle hangs. Gemini fallback now works (v1.6.1 fix).
- **GitHub Dependabot alerts** — 6 vulnerabilities (1 high, 4 moderate, 1 low). Review when possible.
- **Yahoo Finance rate limits** — if the server IP gets blocked again, the Chrome User-Agent fix (v1.6.1) resolves it. If that stops working, consider using a residential proxy or NSE India direct API.

---

## Session Log

### Session: 2026-06-02 — Koushik CH + Claude (claude-sonnet-4-6)

**Work done:**

1. **Bug: Yahoo Finance blocked** (`server/services/prices.ts`)
   - Root cause: Custom User-Agent `Mozilla/5.0 FinPredict` was being rate-limited/timed-out by Yahoo Finance from inside Docker container
   - Fix: Changed to Chrome browser User-Agent string
   - Impact: All `fetchYahooQuote()` and `fetchYahooHistory()` calls now succeed

2. **Bug: Manual trade completely broken** (`server/routes/playground.ts`)
   - Root cause: `/quote/:symbol` and `/trade` endpoints threw hard `badRequest("Could not fetch live price")` when Yahoo returned null — no fallback
   - Fix: Both endpoints now fall back to `latestPrice(stock.id)` from SQLite DB. Response includes `{ stale: true }` / `{ price_source: "cached" }` to signal stale price
   - New import: `latestPrice` from `../services/prices.js`

3. **Bug: Gemini fallback model "auto" invalid** (`server/services/ai.ts`)
   - Root cause: `DEFAULT_AI_MODEL=auto` in .env. When Arbiter timed out, fallback tried `Gemini/auto` — Gemini API doesn't accept "auto", returns 404 immediately. Entire AI cycle failed.
   - Fix: `resolveFallbackChain()` now substitutes `gemini-2.5-flash` when model is `"auto"` and provider is `Gemini`

**Commits today:**
- `f2ff2f9` — fix: Yahoo Finance blocked, Gemini fallback model, playground price fallback
- `dc1bdad` — docs: add v1.6.1 hotfix CHANGELOG entry

**State at end of session:** v1.6.1 running healthy. Playground loads. Manual trades work. AI trader completes cycles with `errors:0`. Gemini fallback confirmed working in logs.
