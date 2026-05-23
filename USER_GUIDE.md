# User Guide — FinPredict-AI

> Complete guide for using FinPredict-AI, the AI-powered investment management platform for Indian markets.

---

## Table of Contents
1. [Getting Started](#getting-started)
2. [Dashboard](#dashboard)
3. [Portfolio Management](#portfolio-management)
4. [AI Predictions](#ai-predictions)
5. [AI Paper Trading (Playground)](#ai-paper-trading-playground)
6. [AI Chat](#ai-chat)
7. [Discovery & News](#discovery--news)
8. [Settings & Configuration](#settings--configuration)
9. [Backup & Recovery (Admin)](#backup--recovery-admin)
10. [Understanding Charges & Tax](#understanding-charges--tax)

---

## Getting Started

FinPredict-AI is an intelligent investment management platform powered by artificial intelligence. It helps you track portfolios, analyze stocks, get AI-driven predictions, and practice trading in a risk-free paper-trading environment.

### First Steps
1. **Register** — Create your account with username and password. Your data is stored securely with bcrypt encryption.
2. **Login** — Your session lasts 24 hours. JWT tokens are used for authentication.
3. **Paper Account** — A virtual ₹1,00,000 paper-trading account is created automatically upon registration.
4. **Set Up Portfolio** — Add your real stock holdings on the Portfolio page, or connect a broker for auto-sync.

### Roles
| Role | Access |
|------|--------|
| Viewer | Read-only access to own data |
| Analyst | Can add stocks, run predictions |
| Admin | System configuration, user management |
| Super Admin | Full access including backups & user deletion |

---

## Dashboard

The dashboard provides a bird's-eye view of your investments:

- **Portfolio Summary** — Total value, today's gain/loss, overall P&L percentage
- **Market Status** — Live indicator showing whether NSE is open or closed
- **Upcoming Holidays** — Next 5 NSE market holidays so you can plan trades
- **Top Movers** — Your biggest gainers and losers today

> **Technical:** Real-time quotes via Yahoo Finance v8 API. Market hours: Mon-Fri 09:15-15:30 IST with full NSE 2025-2026 holiday calendar (30+ holidays).

---

## Portfolio Management

Track your actual stock holdings with live market prices:

- Add positions manually (symbol, quantity, buy price)
- Connect brokers (Zerodha, Groww, Angel One, etc.) for automatic sync
- View real-time P&L, invested value, current value
- Sector-wise allocation breakdown

### Supported Brokers
| Broker | Status | Notes |
|--------|--------|-------|
| Zerodha Kite | Full integration | OAuth v3, SHA-256, auto-sync |
| Groww | Credentials only | CSV import coming |
| Paytm Money | Credentials only | CSV import coming |
| IND Stocks | Credentials only | CSV import coming |

> **Technical:** Supports 166 NSE/BSE stocks across large-cap, mid-cap, small-cap, penny, and ETFs. Prices refresh on page load. Broker integration uses OAuth2 with encrypted token storage.

---

## AI Predictions

Get AI-powered stock predictions using six proven investing strategies:

| Strategy | Approach | Best For |
|----------|----------|----------|
| **Buffett** | Long-term moats, ROE >15%, low debt | Buy & hold investors |
| **Lynch** | PEG <1, growth at reasonable price | Growth investors |
| **Graham** | Deep value, P/B <1.5, margin of safety | Value investors |
| **Momentum** | Breakouts, RSI/MACD signals | Active traders |
| **Mean-Reversion** | Oversold bounces to fair value | Contrarian traders |
| **Balanced** | Synthesizes all approaches | General purpose |

### Prediction Horizons
- **Short** — 2-7 days
- **Medium** — 1 month
- **Long** — 3-12 months
- **Multi-Year** — 1+ years

Each prediction includes: direction (Bullish/Bearish), expected move %, target price, confidence score, and detailed rationale. Predictions are automatically validated when their horizon expires.

### Top Picks Scanner
Click **"Find Top Picks"** to run Balanced-strategy analysis on your universe + watchlist and get the top ranked candidates by `confidence × expected_move`.

> **Technical:** Predictions use 120-day OHLCV history, real-time technicals (RSI14, MACD, SMA20/50, EMA20, Bollinger Bands), and latest news. Validated automatically when the prediction horizon expires.

---

## AI Paper Trading (Playground)

Practice trading with virtual money. The AI can trade autonomously or you trade manually.

### How Auto-Trading Works
1. Enable "Auto-trade" on the Playground page
2. Choose your strategy (Buffett, Momentum, Balanced, etc.) and risk level
3. The AI evaluates the market every 5 minutes during NSE hours (Mon-Fri 09:15-15:30 IST)
4. It analyzes technicals, news, sector trends, and market sentiment
5. Only high-conviction trades are executed (conviction ≥ 0.70)
6. Maximum 3 new positions per cycle to avoid over-trading

### Risk Management (Automatic)

| Control | Default (Moderate) | Effect |
|---------|-------------------|--------|
| Stop-Loss | 5% | Sells if position drops beyond threshold |
| Trailing Stop | 4% from peak | Locks profit if position was up >5% then pulls back |
| Take-Profit | 25% | Sells 50% at target, trails the rest |
| Daily Kill-Switch | 5% | Pauses all trading if daily loss exceeds threshold |
| Position Size Cap | 20% | No single stock exceeds N% of portfolio |
| Anti-Fixation | 2 hours | Cannot re-buy same stock within window |
| Max Buys/Cycle | 3 | Quality over quantity — reduces churning |
| Conviction Threshold | 0.70 | Only executes high-confidence trades |

### Risk Presets
| Level | Max Position | Stop-Loss | Take-Profit | Daily Loss |
|-------|-------------|-----------|-------------|------------|
| Conservative | 10% | 5% | 15% | 3% |
| Moderate | 20% | 8% | 25% | 5% |
| Aggressive | 33% | 12% | 40% | 8% |

### Market Regime Detection
The AI automatically detects whether the market is **Bullish**, **Bearish**, or **Sideways** and adapts its strategy:
- **Bullish** — Favors breakout / momentum entries; trails stops, rides winners
- **Bearish** — Capital preservation; raises cash, tightens stops, defensive sectors only
- **Sideways** — Mean-reversion at support levels; smaller position sizes

### Manual Trading
You can also trade manually via the Manual Trade modal:
- See live price, available cash, current holdings
- Preview gross/fee/net cost before executing
- Choose horizon and strategy tag
- BUY blocked if insufficient cash; SELL blocked if insufficient quantity

### Strategy Performance
The "Strategy Performance" card shows which strategy tags have made or lost money. The AI uses this feedback to bias toward profitable playbooks and avoid losing ones.

> **Technical:** Trading engine in `server/services/paper-trading.ts`. AI temperature 0.3 for consistency. Market regime detection via median 20-bar return + breadth. Anti-fixation prevents buying same stock within 2 hours. Break-even cost calculation rejects unprofitable setups.

---

## AI Chat

Ask questions about stocks, sectors, markets, and your portfolio in natural language:

- "How is RELIANCE performing this week?"
- "What's the market sentiment today?"
- "Show me my portfolio allocation"
- "Compare TCS and INFY fundamentals"

The AI has access to: real-time quotes, your portfolio, watchlist, predictions, market news, and broker data.

### Features
- Multi-session support with auto-titled conversations
- Live ticker injection — any stock symbol in your message auto-resolves to a live quote
- Portfolio-aware — references your actual holdings when relevant
- Restricted to financial topics only

> **Technical:** Context-injected chat with safe HTTP fetching (whitelisted hosts only). Uses the configured AI provider with streaming support.

---

## Discovery & News

### Stock Discovery
AI-powered scanner that periodically (every 4 hours) evaluates all tracked stocks and surfaces opportunities:
- Rated by tier: **S** (exceptional) → **A** → **B** → **C**
- Includes expected upside %, risk level, entry/stop/target prices
- Feeds into the paper trading engine's universe selection

### News Aggregator
Latest market news from multiple sources:
- Primary: NewsAPI.org (if configured)
- Fallback: Google News RSS (no key needed)
- Refreshes every 30 minutes
- Headlines filtered by your watchlist and portfolio holdings
- Fed into the AI trading engine's decision process

### IPO Calendar
- Upcoming NSE mainboard IPOs with dates
- AI-generated verdicts: Subscribe / Avoid / Neutral
- Risk rating, potential upside %, strengths/risks analysis
- Refreshes every 12 hours

---

## Settings & Configuration

### AI Provider
- Use the system default (admin-configured) or set your own
- Supports any OpenAI-compatible endpoint
- Providers: Gemini, OpenAI, Arbiter (auto-routing)
- "Test Connection" button for validation

### Account
- Change password (requires current password)
- View account details and role

---

## Backup & Recovery (Admin)

Enterprise-grade backup system with S3-compatible storage (OCI Object Storage):

### Schedule
| Type | Frequency | Retention |
|------|-----------|-----------|
| Daily | 2:00 AM IST | 7 days |
| Weekly | Sunday 3:00 AM IST | 90 days |
| Manual | On-demand | Never auto-deleted |

### Restore Process
1. Download selected backup from S3
2. Validate as valid SQLite database
3. Stage locally with safety flag
4. Restart server — pre-restore module applies before DB opens
5. Zero data corruption guaranteed

### Storage
- Default limit: 10 GB
- Alerts at 80% usage
- Cleanup job daily at 4 AM IST
- Manual backups must be deleted manually

> **Technical:** Pre-restore module (`server/services/pre-restore.ts`) runs before DB opens. Requires both `.restore` file AND `.restore-pending` flag (double safety). Pre-restore snapshot preserved for rollback. OCI Object Storage with AES-256 encryption.

---

## Understanding Charges & Tax

The paper trading engine simulates real Indian market charges to give you an accurate picture of profitability:

### Transaction Charges (per trade)
| Charge | Rate | Applied On |
|--------|------|-----------|
| Brokerage | 0.03% or ₹20 (whichever is lower) | Both BUY and SELL |
| STT (Securities Transaction Tax) | 0.1% | Both BUY and SELL (delivery) |
| Exchange Transaction Charge | 0.00345% | Both sides |
| GST | 18% | On brokerage + exchange charges |
| SEBI Charges | ₹10 per crore | On turnover |
| Stamp Duty | 0.015% | BUY side only |

### Tax Implications
| Type | Rate | Condition |
|------|------|-----------|
| STCG (Short-Term Capital Gains) | 15% | Holding period < 1 year |
| LTCG (Long-Term Capital Gains) | 10% | Holding > 1 year, gains above ₹1 lakh |
| Speculative Income (Intraday) | Slab rate | Same-day buy+sell (disabled in our engine) |

### Break-Even Calculation
Before executing any trade, the engine calculates the minimum price move needed to cover ALL charges + tax. Trades where the break-even is too high relative to position size are automatically rejected.

**Example:** For a ₹10,000 trade, approximate round-trip charges are ~₹25-35 (0.25-0.35%). After 15% STCG, you need at least ~₹35 profit just to break even.

> **Note:** The engine currently uses STCG (15%) for all profit calculations as most playground trades are short-term. Future versions will add configurable tax regime and annual income settings.
