# FinAI: Enterprise AI-Powered Stock Analysis & Portfolio Tracker

FinAI is a high-performance, full-stack financial intelligence platform designed to bridge the gap between raw market data and actionable insights. By integrating real-time brokerage data with advanced Large Language Models (LLMs), FinAI provides users with a sophisticated dashboard for tracking investments and generating AI-driven market predictions.

---

## 💡 The Idea
The core philosophy of FinAI is **"Data-Driven Conviction."** Most retail investors struggle with information overload. FinAI simplifies this by:
1.  **Automating Data Entry**: Syncing directly with brokerages like Kite (Zerodha).
2.  **Contextual Analysis**: Using Gemini AI to analyze recent price action, technical indicators, and fundamental weights.
3.  **Reliability Tracking**: Monitoring the success rate of different analysis features (Technical vs. Fundamental) to improve prediction accuracy over time.

---

## 🚀 Features

### 🔐 Secure Authentication
-   **JWT-Based Sessions**: Secure, stateless authentication with HTTP-only cookies.
-   **Role-Based Access Control (RBAC)**: Distinct permissions for `Viewer`, `Analyst`, `Admin`, and `Super Admin`.
-   **Bcrypt Encryption**: Industry-standard password hashing.

### 📊 Portfolio Management
-   **Kite Integration**: Automated syncing of holdings and average buy prices.
-   **Real-time Tracking**: Monitor quantity, current value, and overall P&L.
-   **Manual Entry**: Ability to add custom assets for a holistic view.

### 🤖 AI Market Intelligence
-   **Gemini Integration**: Leverages Google's most capable models for deep-dive analysis.
-   **Multi-Horizon Predictions**: Generate forecasts for 2-7 days, 1 month, 3-12 months, or Long Term.
-   **Confidence Scoring**: Every AI prediction comes with a confidence percentage and a detailed technical explanation.

### 🛠️ Enterprise Admin Suite
-   **Dynamic Configuration**: Hot-swap AI models and API keys without restarting the server.
-   **Sync Observability**: Detailed logs for all external API interactions (Kite, News, AI).
-   **User Management**: Full control over user roles and account creation.

---

## 🛠️ Technical Stack

-   **Frontend**: React 19, Tailwind CSS 4, Motion (Framer Motion), Lucide Icons.
-   **Backend**: Node.js, Express.
-   **Database**: SQLite (via `better-sqlite3`) for high-speed, local-first data persistence.
-   **AI SDK**: `@google/genai` (Gemini).
-   **Build Tool**: Vite 6.

---

## 📥 Installation & Setup

### Prerequisites
-   Node.js (v18 or higher)
-   npm or yarn

### Step 1: Clone and Install
```bash
git clone <repository-url>
cd finai-app
npm install
```

### Step 2: Environment Configuration
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_gemini_api_key
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=development
```

### Step 3: Run the Application
```bash
# Start the development server (Express + Vite)
npm run dev
```
The app will be available at `http://localhost:3000`.

---

## 🔄 Working Flow

1.  **Onboarding**: User registers an account. The first user to register as an Admin becomes the primary controller.
2.  **Configuration**: Admin goes to the **Admin Panel** to set up the Gemini API Key and enable Kite integration.
3.  **Data Sync**: The system triggers a background job (or manual sync) to pull holdings from the brokerage.
4.  **Analysis**: User selects a stock from their portfolio and requests an "AI Prediction."
5.  **Processing**: The backend gathers recent price history and technical weights, sends them to Gemini, and parses the structured JSON response.
6.  **Insight**: The user receives a visual prediction card with a clear direction (UP/DOWN/SIDEWAYS) and a technical justification.

---

## 📈 Planned vs. Completed

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **JWT Auth & RBAC** | ✅ Completed | Fully functional with secure cookies. |
| **SQLite Schema** | ✅ Completed | Robust relational structure for stocks/portfolio. |
| **Gemini Integration** | ✅ Completed | Supports dynamic model selection and JSON output. |
| **Kite Mock Sync** | ✅ Completed | Implemented as a reliable background service. |
| **Admin Dashboard** | ✅ Completed | Full configuration and log visibility. |
| **Real-time WebSockets** | ⏳ Planned | For live price streaming. |
| **Advanced Charting** | ⏳ Planned | Integration with D3.js or Lightweight Charts. |
| **News Sentiment** | ⏳ Planned | Pulling real-time headlines for AI context. |

---

## 🗄️ Database Schema (SQLite)

The application uses a relational SQLite schema for high-speed, local-first data persistence:

-   **`users`**: Stores credentials, hashed passwords, and RBAC roles.
-   **`stocks`**: Master list of tracked symbols, names, and sectors.
-   **`stock_prices`**: Historical and current price points for technical analysis.
-   **`portfolio`**: Maps users to stocks with quantity and average cost basis.
-   **`predictions`**: Stores AI-generated forecasts, confidence scores, and explanations.
-   **`feature_reliability`**: Tracks the success rate of different analysis weights (Technical, Fundamental, etc.).
-   **`configurations`**: Key-value store for dynamic app settings (AI models, API keys).
-   **`sync_logs`**: Audit trail for all external service interactions.

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
-   `POST /register`: Create a new user (Admin registration restricted if one exists).
-   `POST /login`: Authenticate and receive a JWT cookie.
-   `GET /me`: Retrieve current user context.
-   `POST /logout`: Clear session cookies.

### Stocks & Portfolio (`/api/stocks`, `/api/portfolio`)
-   `GET /stocks`: List all master stocks.
-   `POST /stocks`: Add a new stock to the master list (Admin only).
-   `GET /portfolio`: Retrieve the current user's holdings.
-   `POST /portfolio`: Manually add an asset to the portfolio.

### Predictions (`/api/predictions`)
-   `GET /predictions`: List all historical predictions (with sorting options).
-   `POST /generate`: Trigger Gemini AI to analyze a stock and generate a new prediction.

### Admin (`/api/admin`)
-   `GET /config`: Retrieve all system configurations.
-   `POST /config`: Update a specific configuration key.
-   `POST /test-connection`: Validate AI or Brokerage connectivity.
-   `GET /fetch-models`: Retrieve available LLM models from the configured provider.
-   `POST /sync/kite`: Manually trigger a portfolio sync.
-   `GET /sync/logs`: View the audit trail of sync attempts.

---

## 📝 TODO List
- [ ] Implement `ResizeObserver` for responsive chart containers.
- [ ] Add unit tests for the AI prompt construction logic.
- [ ] Create a "Paper Trading" mode for analysts to test strategies.
- [ ] Enhance the "Feature Reliability" algorithm to auto-adjust weights based on prediction accuracy.
- [ ] Add multi-currency support for global market tracking.

---

## ❓ FAQ

**Q: Why is my AI connection failing?**
A: Ensure your `AI_API_KEY` is correctly set in the Admin panel. If you are using the default system key, verify that your environment has `GEMINI_API_KEY` defined.

**Q: How often does the portfolio sync?**
A: By default, the system syncs every 6 hours. You can trigger a manual sync anytime from the Admin > Brokerage section.

**Q: Is my data secure?**
A: Yes. All sensitive API keys are stored in the local SQLite database, and session tokens are stored in HTTP-only, secure cookies to prevent XSS attacks.

---

## 🔮 Future Scope
-   **Mobile App**: React Native port for on-the-go tracking.
-   **Social Trading**: Allow users to share their "conviction" and predictions with the community.
-   **Auto-Rebalancing**: AI-suggested portfolio adjustments based on risk tolerance and market conditions.
