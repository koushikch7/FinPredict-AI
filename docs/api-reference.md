---
layout: default
title: API Reference - FinPredict AI
---

# 📖 API Reference

Complete REST API documentation for FinPredict AI.

**Base URL:** `https://your-domain.com/api`

---

## Authentication

All endpoints (except `/health`, `/docs/*`, and auth routes) require a valid JWT token sent as an HTTP-only cookie named `token`.

### Rate Limits

| Endpoint Group | Limit | Window |
|----------------|-------|--------|
| Auth (`/auth/*`) | 30 requests | 15 minutes |
| AI (`/predictions/*`, `/chat/*`) | 40 requests | 5 minutes |
| General | 100 requests | 1 minute |

---

## 🔐 Authentication

### Register User

```http
POST /auth/register
Content-Type: application/json

{
  "username": "string (3-50 chars)",
  "password": "string (6-100 chars)"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "investor",
    "role": "Viewer"
  }
}
```

**Notes:**
- First registered user is auto-promoted to Super Admin
- Sets HTTP-only `token` cookie (24h expiry)

---

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "investor",
    "role": "Viewer"
  }
}
```

---

### Get Current User

```http
GET /auth/me
Cookie: token=<jwt>
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "investor",
    "role": "Viewer"
  }
}
```

---

### Logout

```http
POST /auth/logout
```

Clears the auth cookie.

---

### Change Password

```http
POST /auth/change-password
Cookie: token=<jwt>
Content-Type: application/json

{
  "currentPassword": "string",
  "newPassword": "string (6-100 chars)"
}
```

---

## 📈 Stocks & Market Data

### List All Stocks

```http
GET /stocks
Cookie: token=<jwt>
```

**Response:**
```json
{
  "stocks": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "name": "Reliance Industries Ltd",
      "sector": "Energy",
      "tier": "large"
    }
  ]
}
```

---

### Get Market Status

```http
GET /stocks/market-status
Cookie: token=<jwt>
```

**Response:**
```json
{
  "isOpen": true,
  "isTradingDay": true,
  "currentTime": "2026-06-17T10:30:00+05:30",
  "nextOpen": null,
  "holiday": null
}
```

---

### Get Stock Quote

```http
GET /stocks/:symbol/quote
Cookie: token=<jwt>
```

**Response:**
```json
{
  "symbol": "RELIANCE",
  "ltp": 2456.75,
  "open": 2440.00,
  "high": 2468.50,
  "low": 2435.20,
  "close": 2448.30,
  "volume": 4523100,
  "change": 8.45,
  "changePercent": 0.35,
  "fiftyTwoWeekHigh": 2850.00,
  "fiftyTwoWeekLow": 2100.00,
  "timestamp": "2026-06-17T10:30:00Z"
}
```

---

### Get Price History

```http
GET /stocks/:symbol/history?days=180
Cookie: token=<jwt>
```

**Query Parameters:**
- `days` (optional): Number of days (default: 30, max: 365)

**Response:**
```json
{
  "symbol": "RELIANCE",
  "history": [
    {
      "date": "2026-06-17",
      "open": 2440.00,
      "high": 2468.50,
      "low": 2435.20,
      "close": 2456.75,
      "volume": 4523100
    }
  ]
}
```

---

### Get Technical Indicators

```http
GET /stocks/:symbol/technicals
Cookie: token=<jwt>
```

**Response:**
```json
{
  "symbol": "RELIANCE",
  "technicals": {
    "rsi14": 58.2,
    "macd": { "line": 12.5, "signal": 10.2, "histogram": 2.3 },
    "sma20": 2420.50,
    "sma50": 2380.00,
    "sma200": 2300.00,
    "ema12": 2445.00,
    "ema26": 2410.00,
    "adx": 28.5,
    "atr14": 45.30,
    "bollingerBands": { "upper": 2520, "middle": 2420, "lower": 2320 },
    "obv": 125000000,
    "stochastic": { "k": 72.5, "d": 68.2 },
    "williamsR": -28.5,
    "cci": 85.2,
    "roc": 2.5,
    "vwap": 2448.50,
    "technicalStrength": 68
  }
}
```

---

## 🎯 Predictions

### List Predictions

```http
GET /predictions?sort=created_at&order=desc&limit=50
Cookie: token=<jwt>
```

**Response:**
```json
{
  "predictions": [
    {
      "id": 1,
      "symbol": "RELIANCE",
      "strategy": "Buffett",
      "horizon": "medium",
      "direction": "BULLISH",
      "confidence": 78,
      "entry_price": 2450.00,
      "target_price": 2800.00,
      "stop_loss": 2300.00,
      "reasoning": "Strong competitive moat...",
      "status": "active",
      "created_at": "2026-06-17T10:00:00Z",
      "expires_at": "2026-09-17T10:00:00Z"
    }
  ]
}
```

---

### Generate Prediction

```http
POST /predictions/generate
Cookie: token=<jwt>
Content-Type: application/json

{
  "symbol": "RELIANCE",
  "strategy": "Buffett",
  "horizon": "medium"
}
```

**Parameters:**
- `symbol`: Stock ticker
- `strategy`: `Buffett` | `Lynch` | `Graham` | `Momentum` | `MeanReversion` | `Balanced`
- `horizon`: `swing` | `short` | `medium` | `long`

**Response:**
```json
{
  "prediction": {
    "id": 42,
    "symbol": "RELIANCE",
    "direction": "BULLISH",
    "confidence": 78,
    "target_price": 2800.00,
    "stop_loss": 2300.00,
    "reasoning": "Strong competitive moat with diversified revenue streams..."
  }
}
```

---

### Get Top Picks

```http
POST /predictions/top-picks
Cookie: token=<jwt>
Content-Type: application/json

{
  "strategy": "Buffett",
  "horizon": "medium",
  "count": 5
}
```

---

### Get Accuracy Stats

```http
GET /predictions/accuracy
Cookie: token=<jwt>
```

**Response:**
```json
{
  "total": 150,
  "accurate": 98,
  "partial": 32,
  "failed": 20,
  "accuracyRate": 65.3,
  "byStrategy": {
    "Buffett": { "total": 30, "accurate": 22, "rate": 73.3 }
  }
}
```

---

## 🎮 Paper Trading Playground

### Get Account State

```http
GET /playground
Cookie: token=<jwt>
```

**Response:**
```json
{
  "account": {
    "cash": 85000.00,
    "equity": 98500.00,
    "total_value": 183500.00,
    "initial_capital": 100000.00,
    "pnl": 83500.00,
    "pnl_percent": 83.5,
    "auto_trade": true,
    "strategy": "Balanced",
    "risk_level": "moderate"
  },
  "positions": [
    {
      "id": 1,
      "symbol": "TCS",
      "qty": 5,
      "avg_price": 3500.00,
      "current_price": 3650.00,
      "pnl": 750.00,
      "pnl_percent": 4.29
    }
  ]
}
```

---

### Execute Trade

```http
POST /playground/trade
Cookie: token=<jwt>
Content-Type: application/json

{
  "symbol": "RELIANCE",
  "action": "BUY",
  "qty": 2,
  "reason": "Technical breakout"
}
```

**Parameters:**
- `action`: `BUY` | `SELL`
- `qty`: Number of shares
- `reason` (optional): Trade rationale

---

### Get Trade History

```http
GET /playground/trades?limit=100
Cookie: token=<jwt>
```

---

### Get Equity Curve

```http
GET /playground/equity-curve
Cookie: token=<jwt>
```

**Response:**
```json
{
  "curve": [
    { "date": "2026-06-01", "equity": 100000 },
    { "date": "2026-06-02", "equity": 101200 }
  ]
}
```

---

### Reset Account

```http
POST /playground/reset
Cookie: token=<jwt>
Content-Type: application/json

{
  "initial_capital": 100000
}
```

---

### Update Settings

```http
POST /playground/settings
Cookie: token=<jwt>
Content-Type: application/json

{
  "auto_trade": true,
  "strategy": "Momentum",
  "risk_level": "aggressive",
  "universe": ["RELIANCE", "TCS", "INFY"]
}
```

---

## 💬 AI Chat

### List Sessions

```http
GET /chat/sessions
Cookie: token=<jwt>
```

---

### Get Session Messages

```http
GET /chat/sessions/:id
Cookie: token=<jwt>
```

---

### Send Message

```http
POST /chat/send
Cookie: token=<jwt>
Content-Type: application/json

{
  "sessionId": 1,
  "message": "How is my portfolio doing?"
}
```

**Response:**
```json
{
  "response": {
    "id": 42,
    "role": "assistant",
    "content": "Based on your 12 holdings...",
    "created_at": "2026-06-17T10:30:00Z"
  }
}
```

---

## 📰 News

### Get Market News

```http
GET /news?symbol=RELIANCE&limit=20
Cookie: token=<jwt>
```

**Response:**
```json
{
  "news": [
    {
      "id": 1,
      "title": "Reliance Q1 Results Beat Estimates",
      "source": "Economic Times",
      "url": "https://...",
      "sentiment": 0.72,
      "sentiment_label": "positive",
      "published_at": "2026-06-17T09:00:00Z"
    }
  ]
}
```

---

## 🔗 Brokers

### List Brokers

```http
GET /brokers
Cookie: token=<jwt>
```

---

### Get Login URL (OAuth)

```http
GET /brokers/zerodha/login-url
Cookie: token=<jwt>
```

**Response:**
```json
{
  "url": "https://kite.zerodha.com/connect/login?..."
}
```

---

### Sync Holdings

```http
POST /brokers/zerodha/sync
Cookie: token=<jwt>
```

---

## 🔍 Discovery

### Get Opportunities

```http
GET /discovery
Cookie: token=<jwt>
```

**Response:**
```json
{
  "opportunities": [
    {
      "symbol": "TATAPOWER",
      "score": 85,
      "entry": 420.00,
      "target": 480.00,
      "stop": 390.00,
      "thesis": "Renewable energy tailwinds..."
    }
  ]
}
```

---

### Trigger Scan

```http
POST /discovery/scan
Cookie: token=<jwt>
```

---

## 📅 IPO

### List IPOs

```http
GET /ipo
Cookie: token=<jwt>
```

**Response:**
```json
{
  "ipos": [
    {
      "id": 1,
      "name": "Acme Corp",
      "symbol": "ACME",
      "price_band": "₹300-320",
      "lot_size": 45,
      "opens": "2026-06-20",
      "closes": "2026-06-22",
      "verdict": "Subscribe",
      "thesis": "Strong fundamentals..."
    }
  ]
}
```

---

## 💼 Portfolio

### List Holdings

```http
GET /portfolio
Cookie: token=<jwt>
```

---

### Add/Update Position

```http
POST /portfolio
Cookie: token=<jwt>
Content-Type: application/json

{
  "symbol": "RELIANCE",
  "qty": 10,
  "avg_price": 2400.00
}
```

---

## ⭐ Watchlist

### List Watchlist

```http
GET /watchlist
Cookie: token=<jwt>
```

---

### Add to Watchlist

```http
POST /watchlist
Cookie: token=<jwt>
Content-Type: application/json

{
  "symbol": "RELIANCE",
  "notes": "Watching for breakout"
}
```

---

## 🔧 Admin

### Get Config

```http
GET /admin/config
Cookie: token=<jwt>  (Admin+ role required)
```

**Note:** Sensitive values are masked.

---

### Test AI Connection

```http
GET /admin/ai/test
Cookie: token=<jwt>
```

---

### List Users

```http
GET /admin/users
Cookie: token=<jwt>  (Admin+ role required)
```

---

## 💾 Backups

### List Backups

```http
GET /admin/backups/list
Cookie: token=<jwt>  (Admin+ role required)
```

---

### Create Backup

```http
POST /admin/backups/create
Cookie: token=<jwt>
Content-Type: application/json

{
  "type": "manual",
  "description": "Pre-update backup"
}
```

---

### Restore Backup

```http
POST /admin/backups/restore
Cookie: token=<jwt>
Content-Type: application/json

{
  "key": "backups/daily/2026-06-17.db",
  "confirm": true
}
```

---

## 🏥 Health

### Health Check

```http
GET /health
```

**Response:**
```json
{
  "ok": true,
  "ts": "2026-06-17T10:30:00Z",
  "env": "production",
  "db": "ok"
}
```

---

## 📚 Documentation

### Get Documentation

```http
GET /docs/:name
```

**Parameters:**
- `name`: `README` | `CHANGELOG` | `REQUIREMENTS` | `USER_GUIDE`

Returns raw Markdown content.

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

<p align="center">
  <a href="./postman">📦 Download Postman Collection →</a>
</p>
