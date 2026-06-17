---
layout: default
title: User Guide - FinPredict AI
---

# 📘 User Guide

Complete step-by-step guide to using FinPredict AI.

---

## 🚀 Getting Started

### 1. First Login

1. Navigate to your FinPredict AI instance (e.g., `https://finpredict.example.com`)
2. Click **Register** to create your account
3. Enter a username and secure password
4. **Note:** The first registered user becomes Super Admin automatically

### 2. Dashboard Overview

After login, you'll see the main dashboard with:

- **Portfolio Summary** — Your holdings value and P&L
- **Market Status** — NSE open/closed indicator
- **Quick Stats** — Predictions accuracy, paper trading performance
- **Recent Activity** — Latest predictions and trades

---

## 📊 Portfolio Management

### Adding Holdings

1. Go to **Portfolio** in the sidebar
2. Click **Add Position**
3. Enter:
   - Stock symbol (e.g., `RELIANCE`)
   - Quantity held
   - Average buy price
4. Click **Save**

### Connecting Zerodha

For automatic portfolio sync:

1. Go to **Brokers** in the sidebar
2. Click **Connect Zerodha**
3. Enter your Kite API credentials
4. Complete OAuth authorization
5. Your holdings will sync automatically every 6 hours

### Manual Sync

Click the **Sync** button on the Brokers page to force an immediate sync.

---

## 🎯 AI Predictions

### Generating a Prediction

1. Go to **Predictions** in the sidebar
2. Click **New Prediction**
3. Select:
   - **Stock** — Choose from 166 NSE/BSE symbols
   - **Strategy** — Investment philosophy to apply
   - **Horizon** — Time frame for the prediction
4. Click **Generate**
5. Wait 5-15 seconds for AI analysis

### Understanding Results

Each prediction includes:

| Field | Meaning |
|-------|---------|
| **Direction** | BULLISH (expect rise), BEARISH (expect fall), NEUTRAL |
| **Confidence** | 0-100% conviction score |
| **Target** | Expected price if prediction is correct |
| **Stop Loss** | Suggested exit if wrong |
| **Reasoning** | AI's detailed analysis |

### Prediction Lifecycle

1. **Active** — Waiting for horizon to expire
2. **Validated** — Horizon expired, compared to actual price:
   - ✅ **Accurate** — Direction correct, target approached
   - 🟡 **Partial** — Direction correct, target not reached
   - ❌ **Failed** — Direction wrong

### Top Picks

For quick ideas, use **Top Picks**:
1. Select strategy and horizon
2. Enter count (e.g., 5)
3. Get AI-ranked opportunities instantly

---

## 🎮 Paper Trading Playground

### Overview

Practice trading with ₹1,00,000 virtual cash. Experience realistic:
- Market order execution
- Brokerage charges (₹20/order)
- STT, GST, stamp duty
- Stop-loss/take-profit execution

### Manual Trading

1. Go to **Playground**
2. Click **Trade**
3. Select:
   - Stock symbol
   - BUY or SELL
   - Quantity
4. Optionally add a reason
5. Click **Execute**

### Autonomous Trading

Enable AI to trade for you:

1. Go to **Playground Settings**
2. Enable **Auto Trade**
3. Configure:
   - **Strategy** — AI's investment approach
   - **Risk Level** — Conservative/Moderate/Aggressive
   - **Universe** — Stocks AI can trade (or leave empty for all)
4. Save

The AI will:
- Run every 5 minutes during market hours
- Generate predictions for candidates
- Execute trades meeting conviction thresholds
- Manage stop-loss and take-profit automatically

### Performance Tracking

- **Equity Curve** — Chart of account value over time
- **Trade History** — All executed trades with P&L
- **Strategy Stats** — Performance breakdown by strategy

### Resetting

To start fresh:
1. Click **Reset Account**
2. Optionally change starting capital
3. Confirm

---

## 💬 AI Chat

### Starting a Conversation

1. Go to **Chat** in the sidebar
2. Type your question and press Enter
3. AI responds with portfolio-aware insights

### Sample Questions

```
"How is my portfolio doing today?"
"Should I buy INFY at current levels?"
"What's the technical outlook for TCS?"
"Compare HDFC Bank vs ICICI Bank"
"What are the top momentum stocks right now?"
"Explain why my paper trading P&L dropped"
```

### Tips

- Mention specific tickers for live data injection
- Ask for comparisons between stocks
- Request analysis using specific strategies
- Ask about your positions for personalized advice

---

## ⭐ Watchlist

### Adding Stocks

1. Go to **Watchlist**
2. Click **Add Stock**
3. Enter symbol and optional notes
4. View live prices and quick technicals

### Quick Actions

From the watchlist, you can:
- Jump to full quote
- Generate prediction
- Add to portfolio
- Remove from list

---

## 📰 Market News

### Viewing News

1. Go to **News** in the sidebar
2. Browse recent headlines
3. Filter by symbol if desired

### Sentiment Indicators

Each headline shows FinBERT sentiment:
- 🟢 **Positive** — Bullish news
- 🟡 **Neutral** — Informational
- 🔴 **Negative** — Bearish news

---

## 📅 IPO Calendar

### Viewing IPOs

1. Go to **IPO** in the sidebar
2. See upcoming, live, and recent IPOs

### IPO Details

| Field | Description |
|-------|-------------|
| Price Band | Issue price range |
| Lot Size | Minimum shares to apply |
| Opens/Closes | Application dates |
| Subscription | Times oversubscribed |
| AI Verdict | Subscribe/Avoid/Neutral |

### Refreshing

Click **Refresh** to fetch latest IPO data from NSE.

---

## 🔍 Discovery Scanner

### How It Works

Every 4 hours, AI scans all stocks to find opportunities based on:
- Technical strength
- Sentiment momentum
- Valuation metrics
- Pattern recognition

### Viewing Opportunities

1. Go to **Discovery**
2. Review ranked opportunities
3. Each shows entry, target, stop, and thesis

### Manual Scan

Click **Scan Now** to trigger an immediate analysis.

---

## ⚙️ Settings

### Personal Settings

- **Change Password** — Update your login credentials
- **AI Override** — Use your own AI provider/key

### Admin Settings (Admin+ only)

- **User Management** — Create/delete users, change roles
- **Configuration** — AI provider settings, rate limits
- **Backups** — Create/restore database backups

---

## 👤 User Roles

| Role | Capabilities |
|------|-------------|
| **Viewer** | Read-only access to all features |
| **Analyst** | Add stocks, generate predictions |
| **Admin** | User management, configuration |
| **Super Admin** | Full access including backups |

---

## 📱 Mobile Usage

### Installing as App

**Android (Chrome):**
1. Open site in Chrome
2. Tap menu (⋮) → "Add to Home Screen"
3. Tap "Install"

**iOS (Safari):**
1. Open site in Safari
2. Tap Share → "Add to Home Screen"
3. Tap "Add"

**Desktop:**
1. Look for install icon in address bar
2. Click "Install"

### Mobile Features

- Responsive design for all screens
- Swipe navigation
- Bottom navigation bar
- Offline access to cached data

---

## 🔧 Troubleshooting

### Common Issues

**"Unable to fetch quote"**
- Check if market is open
- Symbol may be delisted or renamed
- Try again in a few seconds

**"AI generation failed"**
- AI provider may be rate-limited
- Check admin AI diagnostics
- Try a different provider

**"Prediction taking too long"**
- Complex analysis can take 15-30 seconds
- AI provider may be congested
- Check connection

**"Paper trade not executing"**
- Ensure market is open
- Check if you have sufficient cash
- Verify stock is in your universe (if set)

### Getting Help

1. Check this user guide
2. Review FAQ in README
3. Check GitHub Issues
4. Contact administrator

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `/` | Focus search |
| `g p` | Go to Portfolio |
| `g w` | Go to Watchlist |
| `g t` | Go to Playground |
| `g c` | Go to Chat |
| `Esc` | Close modal |

---

<p align="center">
  <a href="./deployment">🚀 Deployment Guide →</a>
</p>
