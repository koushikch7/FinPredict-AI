---
layout: default
title: FinPredict AI - AI-Powered Stock Intelligence
---

# 🚀 FinPredict AI

**AI-Powered Indian Stock Market Intelligence Platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933)](https://nodejs.org/)

---

## What is FinPredict AI?

FinPredict AI is a **self-hosted, full-stack investment intelligence platform** designed specifically for the **Indian stock market (NSE/BSE)**. It combines cutting-edge AI with proven technical analysis to deliver:

- 🤖 **AI-Powered Predictions** — 6 investment strategies × 4 time horizons
- 📊 **Autonomous Paper Trading** — Virtual ₹1L account with real market simulation
- 💬 **AI Chat Assistant** — Portfolio-aware conversations with live market data
- 📈 **30+ Technical Indicators** — RSI, MACD, ADX, ATR, Bollinger Bands & more
- 🧠 **FinBERT Sentiment** — NLP-powered news sentiment analysis
- 🔗 **Broker Integration** — Zerodha Kite OAuth + auto-sync holdings
- 📱 **PWA Mobile App** — Installable on any device

---

## ✨ Key Differentiators

| Feature | FinPredict AI | Others |
|---------|--------------|--------|
| **Market Data** | Free (Yahoo Finance v8) | Paid APIs required |
| **AI Provider** | Multi-provider (Gemini/OpenAI/Arbiter) | Single provider lock-in |
| **Deployment** | Single Docker container | Complex orchestration |
| **Data Privacy** | 100% self-hosted | Cloud-only |
| **Indian Markets** | First-class NSE/BSE support | Limited or none |
| **Paper Trading** | Full simulation with charges | Basic or none |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React 19 + Vite PWA                      │
│            TypeScript • Tailwind 4 • Recharts               │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Express 4 REST API                         │
│   JWT Auth • Rate Limiting • Zod Validation • Helmet        │
└─────────────────────────────────────────────────────────────┘
                              │
    ┌─────────────────────────┼─────────────────────────┐
    │                         │                         │
┌───┴───┐              ┌──────┴──────┐           ┌──────┴──────┐
│SQLite │              │ AI Services │           │ Market Data │
│(WAL)  │              │Gemini/OpenAI│           │Yahoo Finance│
└───────┘              │   Arbiter   │           │FinBERT NLP  │
                       └─────────────┘           └─────────────┘
```

---

## 📦 Quick Start

### Docker (Recommended)

```bash
# Clone the repository
git clone https://github.com/koushikch7/FinPredict-AI.git
cd FinPredict-AI

# Configure environment
cp .env.example .env
# Edit .env with your AI provider keys

# Build and run
docker build -t finpredict-ai .
docker run -d --name finpredict \
  -p 3000:3000 \
  --env-file .env \
  -v finpredict-data:/app/data \
  finpredict-ai

# Access at http://localhost:3000
```

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
npm start
```

---

## 📚 Documentation

| Guide | Description |
|-------|-------------|
| [Features](./features) | Detailed feature overview |
| [API Reference](./api-reference) | Complete REST API documentation |
| [User Guide](./user-guide) | Step-by-step usage instructions |
| [Deployment](./deployment) | Production deployment guide |
| [Postman Collection](./postman) | API testing collection |

---

## 🔐 Security

- **bcrypt** password hashing (12 rounds)
- **JWT** tokens with HTTP-only cookies
- **Rate limiting** on sensitive endpoints
- **Zod** schema validation
- **Helmet** security headers
- **CORS** allowlist (no reflected origin)
- **Secret masking** in admin UI

---

## 📈 Supported Stocks

Pre-seeded with **166 NSE/BSE symbols** including:

| Category | Examples |
|----------|----------|
| Large Cap | RELIANCE, TCS, INFY, HDFCBANK |
| Mid Cap | TATAMOTORS, ZOMATO, PAYTM |
| Banking | SBIN, KOTAKBANK, ICICIBANK |
| IT | WIPRO, HCLTECH, TECHM |
| Pharma | SUNPHARMA, DRREDDY, CIPLA |
| ETFs | NIFTYBEES, BANKBEES, GOLDBEES |
| Emerging | IRFC, ADANIENT, JIOFIN |

---

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines and submit PRs.

---

## 📄 License

**MIT License** — Free to use, modify, and distribute with attribution.

```
Copyright (c) 2026 Koushik Chalasani
```

---

## 🔗 Links

- **Live Demo:** [finpredict.chkoushik.com](https://finpredict.chkoushik.com)
- **GitHub:** [koushikch7/FinPredict-AI](https://github.com/koushikch7/FinPredict-AI)
- **Author:** [Koushik Chalasani](https://chkoushik.com)

---

<p align="center">
  <strong>Built with ❤️ for the Indian investor community</strong>
</p>
