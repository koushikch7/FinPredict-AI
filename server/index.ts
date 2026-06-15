import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { logger } from './logger.js';

// CRITICAL: applyPendingRestore must run BEFORE better-sqlite3 opens the DB.
// It lives in a separate module with no transitive db import.
import { applyPendingRestore } from './services/pre-restore.js';
applyPendingRestore();

import { db } from './db/index.js';
import { runMigrations } from './db/migrations.js';
import { errorHandler } from './middleware/error-handler.js';

import { authRouter } from './routes/auth.js';
import { stocksRouter } from './routes/stocks.js';
import { portfolioRouter } from './routes/portfolio.js';
import { watchlistRouter } from './routes/watchlist.js';
import { predictionsRouter } from './routes/predictions.js';
import { brokersRouter } from './routes/brokers.js';
import { playgroundRouter } from './routes/playground.js';
import { chatRouter } from './routes/chat.js';
import { newsRouter } from './routes/news.js';
import { ipoRouter } from './routes/ipo.js';
import { discoveryRouter } from './routes/discovery.js';
import { adminRouter } from './routes/admin.js';
import { backupRouter } from './routes/backup.js';

import { startJobs } from './jobs/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global error handlers to prevent process crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled promise rejection');
  // Do NOT exit - log and continue
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

async function main() {
  runMigrations();

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite/HMR friendly; tighten via reverse proxy in prod
    }),
  );

  // Restrict CORS to known origins only — never reflect arbitrary origins when
  // credentials:true is set (that would enable cross-site request forgery).
  const allowedOrigins = new Set(
    [
      config.APP_URL,
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
    ].filter(Boolean),
  );
  app.use(
    cors({
      origin: (origin, cb) => {
        // Same-origin requests (e.g. curl, Postman, server-to-server) have no Origin header.
        if (!origin || allowedOrigins.has(origin)) return cb(null, true);
        cb(new Error(`CORS: origin '${origin}' not allowed`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Rate limit auth routes
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);

  // Rate limit expensive AI-triggering endpoints to prevent cost-explosion / DoS.
  // Keyed by client IP (app sits behind a trusted proxy).
  const aiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many AI requests — please slow down and retry shortly.' },
  });
  app.use('/api/chat/send', aiLimiter);
  app.use('/api/predictions/generate', aiLimiter);
  app.use('/api/predictions/top-picks', aiLimiter);
  app.use('/api/playground/run-ai', aiLimiter);
  app.use('/api/discovery/scan', aiLimiter);

  // ─── No-cache for all API responses ──────────────────────────
  // Cloudflare aggressively caches JSON when no Cache-Control is set.
  // Force every /api response to bypass CDN + browser cache.
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('CDN-Cache-Control', 'no-store');
    res.set('Cloudflare-CDN-Cache-Control', 'no-store');
    next();
  });

  // ─── API ───────────────────────────────────────────────────────
  app.get('/api/health', (_req, res) => {
    try {
      db.prepare('SELECT 1').get();
      res.json({ ok: true, ts: new Date().toISOString(), env: config.NODE_ENV, db: 'ok' });
    } catch (e: any) {
      res.status(503).json({ ok: false, error: 'Database unhealthy', message: e.message });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/stocks', stocksRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/watchlist', watchlistRouter);
  app.use('/api/predictions', predictionsRouter);
  app.use('/api/brokers', brokersRouter);
  app.use('/api/playground', playgroundRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/ipo', ipoRouter);
  app.use('/api/discovery', discoveryRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/admin/backups', backupRouter);

  // ─── Documentation (serves .md files from workspace root) ─────
  const ALLOWED_DOCS = ['README', 'CHANGELOG', 'REQUIREMENTS', 'USER_GUIDE'];
  app.get('/api/docs/:name', (req, res) => {
    const name = (req.params.name || '').toUpperCase().replace(/\.MD$/, '');
    if (!ALLOWED_DOCS.includes(name)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const filePath = path.resolve(__dirname, '..', `${name}.md`);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.type('text/markdown').send(content);
  });

  // ─── Frontend ─────────────────────────────────────────────────
  if (config.isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, '..', 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
    } else {
      logger.warn({ distDir }, 'dist/ not found - run "npm run build" before starting in prod');
    }
  }

  // Error handler last
  app.use(errorHandler);

  app.listen(config.PORT, '0.0.0.0', () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, 'FinPredict server started');
    startJobs();
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Server failed to start');
  process.exit(1);
});
