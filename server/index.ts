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

import { startJobs } from './jobs/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
  app.use(
    cors({
      origin: (origin, cb) => cb(null, origin || true),
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
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, ts: new Date().toISOString(), env: config.NODE_ENV }),
  );

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
