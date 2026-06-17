---
layout: default
title: Features - FinPredict AI
---

# 🎯 Features & Capabilities

FinPredict AI is packed with enterprise-grade features designed for serious Indian market investors.

---

## 🤖 AI-Powered Predictions

### Investment Strategies

| Strategy | Philosophy | Best For |
|----------|------------|----------|
| **Buffett** | Wide moats, competitive advantages | Long-term compounding |
| **Lynch** | PEG ratio, growth at reasonable price | Growth investors |
| **Graham** | Deep value, margin of safety | Value investors |
| **Momentum** | Trend following, relative strength | Active traders |
| **Mean Reversion** | Oversold bounces, reversion to mean | Contrarian plays |
| **Balanced** | Multi-factor blend | Diversified approach |

### Time Horizons

| Horizon | Duration | Use Case |
|---------|----------|----------|
| **Swing** | 2-7 days | Short-term trades |
| **Short** | 1 month | Positional trades |
| **Medium** | 3-12 months | Investment horizon |
| **Long** | 1+ years | Wealth building |

### How It Works

1. **Context Building** — Gathers 180 days of OHLCV data, 30+ technical indicators, FinBERT sentiment scores, and recent news
2. **AI Analysis** — Sends rich context to LLM with strategy-specific prompts
3. **Structured Output** — Returns direction (BULLISH/BEARISH/NEUTRAL), confidence (0-100), target price, and reasoning
4. **Auto-Validation** — When horizon expires, compares actual vs predicted to label ACCURATE/PARTIAL/FAILED
5. **Feedback Loop** — Weekly feature weight recalibration based on prediction outcomes

---

## 📊 Autonomous Paper Trading

### Virtual Account Features

- **Starting Capital:** ₹1,00,000 virtual cash
- **Realistic Charges:** STT, GST, stamp duty, brokerage (₹20/order)
- **Market Hours Only:** Trades execute during NSE market hours (9:15 AM - 3:30 PM IST)
- **Separate from Real Portfolio:** Zero risk to actual investments

### Risk Management Controls

| Control | Default | Purpose |
|---------|---------|---------|
| **Stop-Loss** | 8% | Maximum loss per position |
| **Take-Profit** | Dynamic | Partial exit at target (50%) |
| **Trailing Stop** | Tiered | Locks in profits as price rises |
| **Position Cap** | 20-33% | Max allocation per stock |
| **Sector Limit** | 30% | Prevents sector concentration |
| **Cash Reserve** | 10% | Maintains buying power |
| **Daily Kill-Switch** | Yes | Pauses on excessive drawdown |
| **Anti-Fixation** | 120 min | BUY cooldown per symbol |
| **Anti-Churn** | 60 min | Minimum hold time |
| **Max BUYs/Cycle** | 3 | Prevents overtrading |

### Market Regime Detection

The system automatically detects market conditions:

| Regime | Trigger | Behavior |
|--------|---------|----------|
| **Bullish** | 20-bar returns > +2% | More aggressive entries |
| **Bearish** | 20-bar returns < -2% | Defensive mode, tighter stops |
| **Sideways** | Returns within ±2% | Normal operation |

### Turbulence Index

| Level | Volatility | Response |
|-------|------------|----------|
| **Normal** | < 1.5σ | Standard position sizing |
| **Elevated** | 1.5-2σ | Reduced position size |
| **Extreme** | > 2σ | Trading paused |

### Ensemble Conviction Scoring

Trades require agreement between:
1. **LLM Prediction** — AI-generated confidence score
2. **Programmatic Scorer** — Rules-based technical/sentiment analysis

Both must signal BUY with:
- Ensemble score ≥ 0.55
- Programmatic floor ≥ 0.40

This prevents AI hallucinations from triggering bad trades.

---

## 💬 AI Chat Assistant

### Capabilities

- **Portfolio Awareness** — Knows your real holdings, P&L, and positions
- **Paper Account Context** — Understands virtual trades and performance
- **Live Market Data** — Auto-injects current prices when you mention tickers
- **Technical Analysis** — Discusses indicators and chart patterns
- **Sentiment Analysis** — Incorporates FinBERT news sentiment
- **Multi-Session** — Maintains conversation history per topic

### Sample Interactions

```
You: "How is my portfolio performing today?"
AI: Based on your 12 holdings, your portfolio is up ₹4,230 (+2.1%) today. 
    Top performers: RELIANCE (+3.2%), TCS (+2.8%)
    Laggards: TATASTEEL (-1.1%)

You: "Should I buy INFY?"
AI: INFY at ₹1,542.30 shows:
    • RSI: 58.2 (neutral)
    • MACD: Bullish crossover 2 days ago
    • Sentiment: +0.42 (positive on Q3 results)
    • Support: ₹1,480 | Resistance: ₹1,600
    
    Consider accumulating on dips to ₹1,500 zone with 
    stop-loss at ₹1,450.
```

---

## 📈 Technical Analysis Engine

### 30+ Indicators

| Category | Indicators |
|----------|------------|
| **Trend** | SMA (20, 50, 200), EMA (12, 26), MACD, ADX |
| **Momentum** | RSI (14), Stochastic, Williams %R, CCI, ROC |
| **Volatility** | Bollinger Bands, ATR, Historical Volatility |
| **Volume** | OBV, VWAP, Volume SMA |
| **Support/Resistance** | 52-week H/L, Pivot Points |

### Technical Strength Score

A composite 0-100 score combining:
- Trend alignment (SMA/EMA relationships)
- Momentum readings (RSI, MACD)
- Volume confirmation (OBV trend)
- Volatility state (Bollinger position)

---

## 🧠 FinBERT Sentiment Analysis

### How It Works

1. **News Aggregation** — Collects headlines from NewsAPI + Google News RSS
2. **FinBERT Scoring** — Sends to HuggingFace Inference API (ProsusAI/finbert)
3. **Sentiment Labels** — Positive (+1), Neutral (0), Negative (-1)
4. **Confidence Weighting** — Higher confidence = more impact

### Sentiment Integration

| Score Range | Interpretation |
|-------------|----------------|
| +0.5 to +1.0 | Strong bullish sentiment |
| +0.2 to +0.5 | Moderate bullish |
| -0.2 to +0.2 | Neutral |
| -0.5 to -0.2 | Moderate bearish |
| -1.0 to -0.5 | Strong bearish sentiment |

---

## 🔗 Broker Integration

### Zerodha Kite

| Feature | Status |
|---------|--------|
| OAuth v3 Login | ✅ Full support |
| Holdings Sync | ✅ Every 6 hours + manual |
| Real-time LTP | ✅ Via WebSocket fallback |
| Order Placement | 🚧 Planned |

### Other Brokers (Planned)

- **Groww** — API integration in progress
- **Paytm Money** — Credential storage ready
- **IND Stocks** — CSV import available

---

## 🔍 Discovery Scanner

### What It Does

Every 4 hours, scans all 166 stocks to find:
- **Undervalued opportunities** — Price < intrinsic value estimate
- **Momentum breakouts** — Breaking resistance with volume
- **Sentiment reversals** — Negative to positive shifts

### Output

| Field | Description |
|-------|-------------|
| Symbol | Stock ticker |
| Score | AI-generated opportunity score |
| Entry | Suggested entry price |
| Target | Price target |
| Stop | Stop-loss level |
| Thesis | One-line reasoning |

---

## 📅 IPO Analysis

### Features

- **NSE Feed Integration** — Auto-fetches upcoming/live IPOs
- **AI Verdicts** — Subscribe/Avoid/Neutral recommendations
- **Key Metrics** — Price band, lot size, subscription status
- **Grey Market Premium** — When available

---

## 💾 Backup & Recovery

### S3-Compatible Storage

- **OCI Object Storage** — Pre-configured
- **AWS S3** — Compatible
- **MinIO** — Self-hosted option

### Retention Policy

| Type | Frequency | Retention |
|------|-----------|-----------|
| Daily | 2 AM | 7 days |
| Weekly | Sunday 3 AM | 90 days |
| Manual | On-demand | Permanent |

### Features

- **Zero-Downtime Backup** — SQLite Online Backup API
- **AES-256 Encryption** — At-rest encryption
- **One-Click Restore** — Safe restore with pre-checks

---

## 📱 PWA Mobile Experience

### Installation

Works as a standalone app on:
- Android (Chrome)
- iOS (Safari)
- Windows (Edge/Chrome)
- macOS (Safari/Chrome)

### Features

- **Offline Shell** — Service worker caches static assets
- **Push Ready** — Infrastructure for notifications
- **Responsive Design** — Mobile-first UI
- **Home Screen Shortcuts** — Quick access to key features

---

## ⚙️ Admin Controls

### User Management

| Role | Capabilities |
|------|-------------|
| **Viewer** | Read-only access to all features |
| **Analyst** | Add stocks, generate predictions |
| **Admin** | User management, config access |
| **Super Admin** | Full system access, backup/restore |

### Configuration

- **AI Provider Settings** — Switch providers without restart
- **Rate Limits** — Adjustable per endpoint
- **Backup Schedule** — Configurable cron expressions
- **Feature Toggles** — Enable/disable modules

---

## 📊 Observability

### Logging

- **Pino** — Structured JSON logging
- **Log Levels** — Configurable (debug/info/warn/error)
- **Request Tracing** — Correlation IDs for debugging

### AI Diagnostics

- **Last 100 Calls** — Provider, model, latency, tokens
- **Error Tracking** — Failed calls with reasons
- **Usage Metrics** — Calls per provider/day

---

<p align="center">
  <a href="./api-reference">📖 API Reference →</a>
</p>
