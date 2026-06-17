---
layout: default
title: Postman Collection - FinPredict AI
---

# 📦 Postman Collection

Import the complete API collection into Postman for easy testing.

---

## Download

<a href="./FinPredict-AI.postman_collection.json" download class="button">
  📥 Download Postman Collection
</a>

---

## Quick Import

### Method 1: Direct Import

1. Open Postman
2. Click **Import** (top-left)
3. Drag and drop the downloaded JSON file
4. Or paste this URL:
   ```
   https://koushikch7.github.io/FinPredict-AI/FinPredict-AI.postman_collection.json
   ```

### Method 2: Raw URL Import

```
https://raw.githubusercontent.com/koushikch7/FinPredict-AI/main/docs/FinPredict-AI.postman_collection.json
```

---

## Setup

### 1. Configure Variables

After import, go to the collection's **Variables** tab:

| Variable | Description | Example |
|----------|-------------|---------|
| `baseUrl` | Your instance URL | `http://localhost:3000` |
| `symbol` | Default stock symbol | `RELIANCE` |

### 2. Authenticate

1. Run the **Login** request first
2. Postman automatically stores the auth cookie
3. All subsequent requests will use it

---

## Collection Structure

### 📁 Health & Info
- Health Check
- Get README
- Get CHANGELOG

### 📁 Authentication
- Register
- Login
- Get Current User
- Change Password
- Logout

### 📁 Stocks & Market Data
- List All Stocks
- Get Market Status
- Get Stock Quote
- Get Price History
- Get Technical Indicators

### 📁 Predictions
- List Predictions
- Get Strategies
- Generate Prediction
- Get Top Picks
- Get Accuracy Stats

### 📁 Paper Trading
- Get Account State
- Get Trade History
- Get Equity Curve
- Get Strategy Stats
- Execute Trade
- Update Settings
- Reset Account
- Run AI Cycle

### 📁 AI Chat
- List Sessions
- Get Session Messages
- Send Message

### 📁 Portfolio
- List Holdings
- Add Position
- Delete Position

### 📁 Watchlist
- List Watchlist
- Add to Watchlist
- Remove from Watchlist

### 📁 News
- Get Market News
- Get News for Symbol

### 📁 IPO
- List IPOs
- Refresh IPO List

### 📁 Discovery
- Get Opportunities
- Trigger Scan

### 📁 Brokers
- List Brokers
- Save Credentials
- Get Login URL
- Sync Holdings

### 📁 Admin
- Get Config
- Test AI Connection
- List AI Models
- AI Diagnostics
- List Users
- Create User

### 📁 Backups
- Get Status
- List Backups
- Create Backup
- Storage Stats

---

## Example Workflows

### Test Basic Connectivity

1. Run **Health Check** → Should return `{"ok": true}`
2. Run **Get README** → Returns documentation

### Test Authentication Flow

1. Run **Register** (first time only)
2. Run **Login** → Stores auth cookie
3. Run **Get Current User** → Verifies authentication

### Test AI Prediction

1. Login first
2. Run **Get Stock Quote** for a symbol
3. Run **Generate Prediction** with same symbol
4. Run **List Predictions** to see result

### Test Paper Trading

1. Login first
2. Run **Get Account State** → See virtual cash
3. Run **Execute Trade** → Buy a stock
4. Run **Get Trade History** → See the trade
5. Run **Get Equity Curve** → Track performance

---

## Environment Templates

### Local Development

```json
{
  "baseUrl": "http://localhost:3000",
  "symbol": "RELIANCE"
}
```

### Production

```json
{
  "baseUrl": "https://finpredict.yourdomain.com",
  "symbol": "TCS"
}
```

---

## Tips

### Cookie Handling

Postman automatically handles cookies. After logging in, the `token` cookie is stored and sent with all subsequent requests.

### Rate Limits

Be mindful of rate limits:
- Auth endpoints: 30 requests / 15 minutes
- AI endpoints: 40 requests / 5 minutes
- General: 100 requests / minute

### Error Responses

All errors return:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## cURL Examples

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user","password":"pass"}' \
  -c cookies.txt
```

### Generate Prediction
```bash
curl -X POST http://localhost:3000/api/predictions/generate \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"symbol":"RELIANCE","strategy":"Buffett","horizon":"medium"}'
```

### Execute Trade
```bash
curl -X POST http://localhost:3000/api/playground/trade \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{"symbol":"TCS","action":"BUY","qty":5}'
```

---

<p align="center">
  <a href="./api-reference">📖 Full API Reference →</a>
</p>
