import { db } from './index.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import { SEED_STOCKS } from './stock-seed.js';

/**
 * Idempotent schema setup. Safe to call on every boot.
 * Each migration is wrapped so that adding a new one is additive.
 */
export function runMigrations(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT UNIQUE NOT NULL,
      name TEXT,
      sector TEXT,
      exchange TEXT DEFAULT 'NSE',
      instrument_token TEXT,
      tier TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_stocks_symbol ON stocks(symbol);

    CREATE TABLE IF NOT EXISTS stock_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id INTEGER NOT NULL,
      price REAL NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      change_p REAL,
      volume INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_prices_stock_ts ON stock_prices(stock_id, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_prices_timestamp ON stock_prices(timestamp DESC);

    CREATE TABLE IF NOT EXISTS portfolio (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      average_price REAL NOT NULL,
      source TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_user_stock ON portfolio(user_id, stock_id);

    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_user_stock ON watchlist(user_id, stock_id);

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      expected_move_p REAL,
      target_price REAL,
      horizon TEXT NOT NULL,
      confidence REAL,
      ai_explanation TEXT,
      strategy TEXT,
      model_version TEXT,
      input_snapshot TEXT,
      status TEXT DEFAULT 'PENDING',
      result TEXT,
      actual_move_p REAL,
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      validated_at DATETIME,
      validate_after DATETIME,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_predictions_user ON predictions(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_predictions_validate ON predictions(status, validate_after);

    CREATE TABLE IF NOT EXISTS feature_reliability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feature_name TEXT UNIQUE NOT NULL,
      times_used INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0,
      weight REAL DEFAULT 1.0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configurations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      category TEXT DEFAULT 'General',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings ON user_settings(user_id, key);

    CREATE TABLE IF NOT EXISTS broker_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      broker TEXT NOT NULL,
      api_key TEXT,
      api_secret TEXT,
      access_token TEXT,
      access_token_expiry DATETIME,
      enabled INTEGER DEFAULT 0,
      meta TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_user ON broker_accounts(user_id, broker);

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      service TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_sync_logs_ts ON sync_logs(timestamp DESC);

    CREATE TABLE IF NOT EXISTS news_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      headline TEXT NOT NULL,
      source TEXT,
      url TEXT UNIQUE,
      published_at DATETIME,
      summary TEXT,
      sentiment TEXT,
      sentiment_score REAL,
      symbols TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_news_published ON news_articles(published_at DESC);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id, created_at);

    -- ─── Paper-trading playground ───────────────────────────────
    CREATE TABLE IF NOT EXISTS paper_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      starting_capital REAL NOT NULL,
      cash REAL NOT NULL,
      auto_trade INTEGER DEFAULT 0,
      strategy TEXT DEFAULT 'Balanced',
      risk_level TEXT DEFAULT 'Moderate',
      universe TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      average_price REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_pos ON paper_positions(account_id, stock_id);

    CREATE TABLE IF NOT EXISTS paper_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      stock_id INTEGER NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      gross REAL NOT NULL,
      fees REAL DEFAULT 0,
      net REAL NOT NULL,
      reason TEXT,
      ai_decision INTEGER DEFAULT 0,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_paper_trades_acc ON paper_trades(account_id, executed_at DESC);

    CREATE TABLE IF NOT EXISTS paper_equity_curve (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      cash REAL NOT NULL,
      equity REAL NOT NULL,
      total REAL NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES paper_accounts(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_equity_curve ON paper_equity_curve(account_id, timestamp);

    -- ─── IPOs (persisted with AI analysis) ───────────────────
    CREATE TABLE IF NOT EXISTS ipos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      symbol TEXT,
      open_date TEXT,
      close_date TEXT,
      price_band TEXT,
      status TEXT,
      source TEXT DEFAULT 'NSE',
      ai_recommendation TEXT,            -- SUBSCRIBE | AVOID | NEUTRAL
      ai_rating REAL,                    -- 0..5 stars
      ai_risk_level TEXT,                -- Low | Medium | High
      ai_potential_pct REAL,             -- expected listing-day or 1-month upside
      ai_horizon TEXT,                   -- Listing | Short-term | Long-term
      ai_summary TEXT,
      ai_strengths TEXT,                 -- JSON string[]
      ai_risks TEXT,                     -- JSON string[]
      ai_analyst_view TEXT,              -- compressed brokerage consensus, if any
      analyzed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ipos_key ON ipos(name, COALESCE(open_date,''));

    -- ─── AI-discovered stock opportunities ──────────────────────
    CREATE TABLE IF NOT EXISTS stock_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_id INTEGER NOT NULL,
      score REAL NOT NULL,               -- 0..100
      direction TEXT NOT NULL,           -- BUY | HOLD | AVOID
      horizon TEXT NOT NULL,             -- Intraday | Short-term | Long-term
      expected_upside_pct REAL,
      risk_level TEXT,                   -- Low | Medium | High
      rationale TEXT,
      strategy TEXT,
      ai_provider TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(stock_id) REFERENCES stocks(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_opps_score ON stock_opportunities(score DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_opps_stock ON stock_opportunities(stock_id, created_at DESC);
  `);

  // ── v1.1: paper_accounts risk-control columns (idempotent) ──
  const accCols = db.prepare("PRAGMA table_info(paper_accounts)").all() as Array<{ name: string }>;
  const has = (n: string) => accCols.some((c) => c.name === n);
  const addCol = (sql: string) => {
    try { db.exec(sql); } catch (e: any) { if (!/duplicate column/i.test(e.message)) throw e; }
  };
  if (!has('max_position_pct')) addCol("ALTER TABLE paper_accounts ADD COLUMN max_position_pct REAL DEFAULT 20");
  if (!has('stop_loss_pct')) addCol("ALTER TABLE paper_accounts ADD COLUMN stop_loss_pct REAL DEFAULT 8");
  if (!has('take_profit_pct')) addCol("ALTER TABLE paper_accounts ADD COLUMN take_profit_pct REAL DEFAULT 25");
  if (!has('max_daily_loss_pct')) addCol("ALTER TABLE paper_accounts ADD COLUMN max_daily_loss_pct REAL DEFAULT 5");
  if (!has('paused_until')) addCol("ALTER TABLE paper_accounts ADD COLUMN paused_until DATETIME");

  // ── v1.2: stocks.tier (cap-tier) for cross-cap discovery scanning ──
  const stockCols = db.prepare("PRAGMA table_info(stocks)").all() as Array<{ name: string }>;
  if (!stockCols.some((c) => c.name === 'tier')) {
    addCol("ALTER TABLE stocks ADD COLUMN tier TEXT");
  }

  // ── v1.3: paper_trades.horizon (Intraday/Short/Long) for AI-decided holding period ──
  const tradeCols = db.prepare("PRAGMA table_info(paper_trades)").all() as Array<{ name: string }>;
  if (!tradeCols.some((c) => c.name === 'horizon')) {
    addCol("ALTER TABLE paper_trades ADD COLUMN horizon TEXT");
  }
  // ── v1.2.1: paper_trades.ai_provider / ai_model / ai_upstream_model for per-trade AI attribution ──
  if (!tradeCols.some((c) => c.name === 'ai_provider')) addCol("ALTER TABLE paper_trades ADD COLUMN ai_provider TEXT");
  if (!tradeCols.some((c) => c.name === 'ai_model')) addCol("ALTER TABLE paper_trades ADD COLUMN ai_model TEXT");
  if (!tradeCols.some((c) => c.name === 'ai_upstream_model')) addCol("ALTER TABLE paper_trades ADD COLUMN ai_upstream_model TEXT");
  if (!tradeCols.some((c) => c.name === 'ai_latency_ms')) addCol("ALTER TABLE paper_trades ADD COLUMN ai_latency_ms INTEGER");

  // ── v1.2.2: strategy attribution + realised P&L per trade for outcome learning ──
  if (!tradeCols.some((c) => c.name === 'strategy_tag')) addCol("ALTER TABLE paper_trades ADD COLUMN strategy_tag TEXT");
  if (!tradeCols.some((c) => c.name === 'realized_pnl')) addCol("ALTER TABLE paper_trades ADD COLUMN realized_pnl REAL");
  if (!tradeCols.some((c) => c.name === 'market_regime')) addCol("ALTER TABLE paper_trades ADD COLUMN market_regime TEXT");

  // Seed feature reliability
  const features = [
    { name: 'Technical', weight: 0.3 },
    { name: 'Fundamental', weight: 0.3 },
    { name: 'Sentiment', weight: 0.2 },
    { name: 'Macro', weight: 0.2 },
  ];
  const insertFeature = db.prepare(
    'INSERT OR IGNORE INTO feature_reliability (feature_name, weight) VALUES (?, ?)',
  );
  for (const f of features) insertFeature.run(f.name, f.weight);

  // Seed default global configurations
  const seedConfig = db.prepare(
    'INSERT OR IGNORE INTO configurations (key, value, category) VALUES (?, ?, ?)',
  );
  const defaults: Array<[string, string, string]> = [
    ['MARKET_REGION', 'IN', 'General'],
    ['BASE_CURRENCY', 'INR', 'General'],
    ['DEFAULT_AI_PROVIDER', config.DEFAULT_AI_PROVIDER, 'AI'],
    ['DEFAULT_AI_MODEL', config.DEFAULT_AI_MODEL, 'AI'],
    ['NEWS_PROVIDER', 'NewsAPI', 'News'],
    ['ALLOWED_BROKERS', 'kite,groww,paytm,indstocks', 'Brokerage'],
  ];
  for (const [k, v, c] of defaults) seedConfig.run(k, v, c);

  // Migration: if an older install still has DEFAULT_AI_PROVIDER=Gemini in the
  // configurations table but the operator has switched the env to Arbiter,
  // honour the env override so the smart-router takes effect on boot without
  // requiring a manual UI change.
  const updateIfStale = db.prepare(
    `UPDATE configurations SET value = ? WHERE key = ? AND value = ?`,
  );
  if (config.DEFAULT_AI_PROVIDER !== 'Gemini') {
    updateIfStale.run(config.DEFAULT_AI_PROVIDER, 'DEFAULT_AI_PROVIDER', 'Gemini');
  }
  if (config.DEFAULT_AI_MODEL !== 'gemini-2.5-flash') {
    updateIfStale.run(config.DEFAULT_AI_MODEL, 'DEFAULT_AI_MODEL', 'gemini-2.5-flash');
  }

  // Seed cross-cap NSE universe (large → penny + ETFs)
  const seedStock = db.prepare(
    'INSERT INTO stocks (symbol, name, sector, exchange, tier) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, sector = excluded.sector, tier = excluded.tier',
  );
  for (const s of SEED_STOCKS) seedStock.run(s.symbol, s.name, s.sector, 'NSE', s.tier);

  logger.info({ stockCount: SEED_STOCKS.length }, 'Database migrations applied');

  // ────────────────────────────────────────────────────────────────────────
  // FP-1.20.1-universe-unlock: clear stale 10-blue-chip universes so accounts
  // switch to AUTO mode and benefit from the stratified 50-symbol builder.
  // The old code stored DEFAULT_UNIVERSE = ['RELIANCE','TCS','INFY',...] at
  // account creation, permanently sticky. This one-shot migration nulls the
  // column when it exactly matches that legacy default.
  // ────────────────────────────────────────────────────────────────────────
  try {
    const OLD_DEFAULT = JSON.stringify(['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','ITC','SBIN','LT','BHARTIARTL','MARUTI']);
    const r = db.prepare('UPDATE paper_accounts SET universe = NULL WHERE universe = ?').run(OLD_DEFAULT);
    if (r.changes > 0) {
      console.log(`[migration] FP-1.20.1-universe-unlock: switched ${r.changes} account(s) to AUTO universe`);
    }
  } catch (e) {
    console.warn('[migration] FP-1.20.1-universe-unlock skipped:', (e as Error).message);
  }

}
