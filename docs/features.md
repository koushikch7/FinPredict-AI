---
layout: default
title: Features — FinPredict AI
description: Comprehensive feature documentation for FinPredict AI - AI predictions, paper trading, technical analysis, and more.
---

# 🎯 Features & Capabilities

<p class="tagline" style="font-size: 1.2rem; color: #64748b; margin-bottom: 2rem;">
Enterprise-grade features designed for serious Indian market investors.
</p>

---

## 🤖 AI-Powered Predictions

Our AI engine combines multiple investment philosophies with advanced market data to generate actionable predictions.

### Investment Strategies

<div class="features-grid">
  <div class="feature-card">
    <div class="icon">🏛️</div>
    <h3>Buffett Strategy</h3>
    <p><strong>Philosophy:</strong> Wide moats, competitive advantages, durable businesses</p>
    <p><strong>Best for:</strong> Long-term wealth building, dividend investors</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">📈</div>
    <h3>Lynch Strategy</h3>
    <p><strong>Philosophy:</strong> PEG ratio, growth at reasonable price, hidden gems</p>
    <p><strong>Best for:</strong> Growth investors seeking undervalued opportunities</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">📊</div>
    <h3>Graham Strategy</h3>
    <p><strong>Philosophy:</strong> Deep value, margin of safety, intrinsic value</p>
    <p><strong>Best for:</strong> Conservative value investors</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🚀</div>
    <h3>Momentum Strategy</h3>
    <p><strong>Philosophy:</strong> Trend following, relative strength, breakouts</p>
    <p><strong>Best for:</strong> Active traders, swing trading</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🔄</div>
    <h3>Mean Reversion</h3>
    <p><strong>Philosophy:</strong> Oversold bounces, extreme RSI plays</p>
    <p><strong>Best for:</strong> Contrarian investors</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">⚖️</div>
    <h3>Balanced Strategy</h3>
    <p><strong>Philosophy:</strong> Multi-factor blend of all strategies</p>
    <p><strong>Best for:</strong> Diversified, systematic approach</p>
  </div>
</div>

### Time Horizons

| Horizon | Duration | Use Case | Auto-Validation |
|---------|----------|----------|-----------------|
| **Swing** | 2-7 days | Quick trades, earnings plays | ✅ |
| **Short** | 1 month | Positional trades | ✅ |
| **Medium** | 3-12 months | Investment horizon | ✅ |
| **Long** | 1+ years | Wealth building | ✅ |

### Prediction Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Data Input    │     │   AI Analysis   │     │    Output       │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ • 180d OHLCV    │────▶│ • Strategy      │────▶│ • Direction     │
│ • 30+ Technicals│     │   Prompts       │     │ • Confidence    │
│ • FinBERT Sent. │     │ • Context       │     │ • Target Price  │
│ • Recent News   │     │   Building      │     │ • Stop Loss     │
│ • Market Regime │     │ • LLM Call      │     │ • Reasoning     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │ Auto-Validation │
                                               │ (on expiry)     │
                                               ├─────────────────┤
                                               │ ✅ ACCURATE     │
                                               │ 🟡 PARTIAL      │
                                               │ ❌ FAILED       │
                                               └─────────────────┘
```

<div class="alert alert-success">
<strong>Feedback Loop:</strong> Prediction outcomes are fed back into feature weight recalibration (weekly), improving accuracy over time.
</div>

---

## 📊 Autonomous Paper Trading

Practice trading with zero risk using our intelligent paper trading system.

### Virtual Account

| Feature | Specification |
|---------|---------------|
| **Starting Capital** | ₹1,00,000 virtual cash |
| **Realistic Charges** | STT, GST, Stamp Duty, ₹20 brokerage |
| **Market Hours** | NSE hours (9:15 AM - 3:30 PM IST) |
| **Execution** | Market orders at live LTP |

### Risk Management Controls

<div class="features-grid">
  <div class="feature-card">
    <div class="icon">🛑</div>
    <h3>Stop-Loss (8%)</h3>
    <p>Automatic exit when unrealized loss exceeds threshold. Configurable per risk level.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🎯</div>
    <h3>Take-Profit (25%)</h3>
    <p>Partial exit at target with 50% position harvesting.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">📈</div>
    <h3>Trailing Stop</h3>
    <p>Tiered give-back system with persisted high-water mark. Locks in profits as price rises.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🚫</div>
    <h3>Position Cap (20-33%)</h3>
    <p>Maximum single-position weight as % of total equity. Prevents concentration risk.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🏭</div>
    <h3>Sector Limit (30%)</h3>
    <p>Maximum sector concentration to ensure diversification.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">💰</div>
    <h3>Cash Reserve (10%)</h3>
    <p>Dry powder reserve maintained for opportunities.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">⚠️</div>
    <h3>Daily Kill-Switch (5%)</h3>
    <p>AI paused for the session if daily drawdown exceeds threshold.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">⏱️</div>
    <h3>Anti-Churn (60 min)</h3>
    <p>Minimum hold time prevents excessive trading fees.</p>
  </div>
  
  <div class="feature-card">
    <div class="icon">🔒</div>
    <h3>Anti-Fixation (120 min)</h3>
    <p>Rolling BUY cooldown per symbol prevents overtrading.</p>
  </div>
</div>

### Market Regime Detection

The system automatically detects market conditions and adjusts behavior:

| Regime | Trigger | AI Behavior |
|--------|---------|-------------|
| **🟢 Bullish** | 20-bar returns > +2% | Aggressive entries, wider stops |
| **🔴 Bearish** | 20-bar returns < -2% | Defensive mode, tighter stops, reduced size |
| **🟡 Sideways** | Returns within ±2% | Normal operation, mean-reversion bias |

### Turbulence Index

| Level | Volatility | Response |
|-------|------------|----------|
| **Normal** | < 1.5σ | Standard position sizing |
| **Elevated** | 1.5-2σ | Position sizes halved |
| **Extreme** | > 2σ | All new BUYs blocked |

### Ensemble Conviction Scoring

Every trade requires agreement between two independent scorers:

```
┌──────────────────┐     ┌──────────────────┐
│    LLM Score     │     │ Programmatic     │
│   (AI Model)     │     │    Scorer        │
├──────────────────┤     ├──────────────────┤
│ • Strategy fit   │     │ • Technical str. │
│ • Context anal.  │     │ • FinBERT sent.  │
│ • Market regime  │     │ • Prediction acc │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └────────┬───────────────┘
                  ▼
         ┌──────────────────┐
         │ Ensemble Score   │
         │                  │
         │ Require: ≥ 0.55  │
         │ Floor:   ≥ 0.40  │
         │ (programmatic)   │
         └──────────────────┘
```

<div class="alert alert-warning">
<strong>Why Ensemble?</strong> Prevents AI hallucinations from triggering bad trades. The programmatic scorer acts as a sanity check.
</div>

---

## 🧠 FinBERT Sentiment Analysis

Real-time news sentiment analysis using the financial-specific BERT model.

### How It Works

1. **News Aggregation** — Headlines collected from NewsAPI + Google News RSS
2. **FinBERT Scoring** — Sent to HuggingFace Inference API (ProsusAI/finbert)
3. **Sentiment Labels** — Positive (+1), Neutral (0), Negative (-1)
4. **Confidence Weighting** — Higher confidence scores have more impact

### Sentiment Score Interpretation

| Score Range | Label | Market Interpretation |
|-------------|-------|----------------------|
| +0.5 to +1.0 | 🟢 Strong Positive | Strong bullish pressure |
| +0.2 to +0.5 | 🟢 Positive | Moderate bullish |
| -0.2 to +0.2 | 🟡 Neutral | No clear direction |
| -0.5 to -0.2 | 🔴 Negative | Moderate bearish |
| -1.0 to -0.5 | 🔴 Strong Negative | Strong bearish pressure |

### Integration Points

- **Predictions** — 7-day sentiment average + trend included in AI context
- **Paper Trading** — Ensemble scorer considers sentiment momentum
- **Chat** — Sentiment injected when discussing specific stocks
- **Discovery** — Sentiment reversals flagged as opportunities

---

## 📈 Technical Analysis Engine

30+ technical indicators computed in real-time for every stock.

### Indicator Categories

#### Trend Indicators
- SMA (20, 50, 200)
- EMA (12, 26)
- MACD (12, 26, 9)
- ADX (14)

#### Momentum Indicators
- RSI (14)
- Stochastic (14, 3, 3)
- Williams %R (14)
- CCI (20)
- ROC (12)

#### Volatility Indicators
- Bollinger Bands (20, 2σ)
- ATR (14)
- Historical Volatility

#### Volume Indicators
- OBV
- VWAP
- Volume SMA

#### Support/Resistance
- 52-week High/Low
- Pivot Points

### Technical Strength Score

A composite 0-100 score combining all indicators:

```
Technical Strength = Σ(weight_i × signal_i)

Where signals include:
- Trend alignment (SMA/EMA relationships)
- Momentum readings (RSI position, MACD histogram)
- Volume confirmation (OBV trend vs price)
- Volatility state (Bollinger position)
- Support/resistance proximity
```

<div class="alert alert-info">
<strong>Usage:</strong> Technical Strength Score is displayed in predictions, paper trading decisions, and available via API.
</div>

---

## 💬 AI Chat Assistant

Portfolio-aware conversational interface with live market data injection.

### Capabilities

| Feature | Description |
|---------|-------------|
| **Portfolio Context** | Knows your real holdings, P&L, positions |
| **Paper Account** | Understands virtual trades and performance |
| **Live Quotes** | Auto-injects current prices for mentioned tickers |
| **Technical Data** | Discusses indicators and chart patterns |
| **Sentiment** | Incorporates FinBERT news sentiment |
| **Multi-Session** | Maintains conversation history per topic |

### Example Conversations

**Portfolio Analysis:**
```
You: "How is my portfolio doing today?"
AI:  Based on your 12 holdings, your portfolio is up ₹4,230 (+2.1%) today.
     Top performers: RELIANCE (+3.2%), TCS (+2.8%)
     Laggards: TATASTEEL (-1.1%)
```

**Stock Analysis:**
```
You: "Should I buy INFY at current levels?"
AI:  INFY at ₹1,542.30 shows:
     • RSI: 58.2 (neutral zone)
     • MACD: Bullish crossover 2 days ago
     • Sentiment: +0.42 (positive on Q3 results)
     • Support: ₹1,480 | Resistance: ₹1,600
     
     Consider accumulating on dips to ₹1,500 zone.
```

**Comparison:**
```
You: "Compare HDFC Bank vs ICICI Bank"
AI:  Quick comparison:
     
     | Metric | HDFCBANK | ICICIBANK |
     |--------|----------|-----------|
     | RSI    | 62       | 55        |
     | P/E    | 18.5     | 16.2      |
     | Sent.  | +0.35    | +0.42     |
     | Tech.  | 72       | 68        |
     
     ICICI shows slightly better value and sentiment...
```

---

## 🔗 Broker Integration

### Zerodha Kite (Full Support)

| Feature | Status |
|---------|--------|
| OAuth v3 Login | ✅ Complete |
| Holdings Sync | ✅ Every 6 hours + manual |
| Real-time LTP | ✅ Via WebSocket fallback |
| Order Placement | 🚧 Planned |

### Other Brokers

| Broker | Status |
|--------|--------|
| **Groww** | 🔄 API integration planned |
| **Paytm Money** | 📁 Credential storage ready |
| **IND Stocks** | 📁 CSV import available |

---

## 🔍 Discovery Scanner

Every 4 hours, AI scans all 166 stocks to find opportunities.

### Scan Categories

- **Undervalued** — Price below intrinsic value estimate
- **Momentum Breakouts** — Breaking resistance with volume
- **Sentiment Reversals** — Negative to positive shifts
- **Technical Setups** — Pattern recognition (flags, triangles)

### Output Fields

| Field | Description |
|-------|-------------|
| Symbol | Stock ticker |
| Score | AI opportunity score (0-100) |
| Entry | Suggested entry price |
| Target | Price target |
| Stop | Stop-loss level |
| Thesis | One-line reasoning |

---

## 📅 IPO Analysis

Automated IPO tracking and AI-powered verdicts.

### Features

- **NSE Feed** — Auto-fetches upcoming/live IPOs
- **AI Verdicts** — Subscribe/Avoid/Neutral recommendations
- **Key Metrics** — Price band, lot size, subscription status
- **Risk Analysis** — Detailed strengths and risks

### Verdict Structure

```json
{
  "recommendation": "SUBSCRIBE",
  "rating": 4.2,
  "risk_level": "Medium",
  "potential_pct": 25,
  "horizon": "6 months",
  "summary": "Strong fundamentals...",
  "strengths": ["Market leader", "Growing TAM"],
  "risks": ["Valuation premium", "Competition"],
  "analyst_view": "Consensus positive..."
}
```

---

## 💾 Enterprise Backup & Recovery

### S3-Compatible Storage

- **OCI Object Storage** — Pre-configured
- **AWS S3** — Compatible
- **MinIO** — Self-hosted option

### Retention Policy

| Type | Frequency | Retention |
|------|-----------|-----------|
| Daily | 2 AM IST | 7 days |
| Weekly | Sunday 3 AM | 90 days |
| Manual | On-demand | Permanent |

### Features

- **Zero-Downtime** — SQLite Online Backup API
- **AES-256 Encryption** — At-rest encryption
- **One-Click Restore** — Safe restore with pre-checks
- **Double-Flag Safety** — Confirmation required

---

## ⏰ Background Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| `*/5 * * * 1-5` | AI Trader | Paper trading cycle (market hours) |
| `*/10 * * * 1-5` | Price Snapshot | Cache live prices |
| `*/5 * * * *` | Equity Curve | Recompute account equity |
| `0 * * * *` | Validation | Auto-validate due predictions |
| `*/30 * * * *` | News | Refresh market headlines |
| `*/15 * * * *` | FinBERT | Score unscored news |
| `0 */4 * * *` | Discovery | Cross-cap AI scanner |
| `0 */12 * * *` | IPO | Refresh + analyze IPOs |
| `0 */6 * * *` | Broker Sync | Sync enabled brokers |
| `0 0 * * 0` | Weights | Feature weight recalibration |
| `0 2 * * *` | Daily Backup | S3 backup (7-day retention) |
| `0 3 * * 0` | Weekly Backup | S3 backup (90-day retention) |

---

<div class="doc-footer">
  <a href="./api-reference">📖 API Reference →</a>
</div>
