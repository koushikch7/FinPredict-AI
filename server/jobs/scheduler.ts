import cron from 'node-cron';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runAITraderCycle, recomputeEquity, getOrCreateAccount } from '../services/paper-trading.js';
import { validatePendingPredictions } from '../services/predictions.js';
import { fetchMarketNews, persistNews } from '../services/news.js';
import { scoreUnscoredNews } from '../services/sentiment.js';
import { updateFeatureWeights } from '../services/conviction.js';
import { syncAllBrokersForUser } from '../services/portfolio-sync.js';
import { isNseOpen } from '../utils/market-hours.js';
import { refreshIPOs } from '../services/ipo.js';
import { runDiscoveryScan } from '../services/discovery.js';
import { snapshotPrices } from '../services/prices.js';

let started = false;
let traderRunning = false;

export function startJobs() {
  if (started) return;
  started = true;

  // Playground AI trader: every N minutes during NSE hours
  cron.schedule(config.PLAYGROUND_CRON, async () => {
    if (!isNseOpen() || traderRunning) return;
    traderRunning = true;
    try {
      const users = db.prepare('SELECT user_id FROM paper_accounts WHERE auto_trade = 1').all() as { user_id: number }[];
      for (const u of users) {
        try {
          const r = await runAITraderCycle(u.user_id);
          logger.info({ userId: u.user_id, executed: r.executed, errors: r.errors.length }, 'AI trader cycle');
        } catch (e: any) {
          logger.error({ err: e.message, userId: u.user_id }, 'AI trader cycle failed');
        }
      }
    } finally {
      traderRunning = false;
    }
  });

  // ── Price snapshot: every 10 min during NSE hours ──
  // Populates `stock_prices` for the liquid + actively-traded universe so that
  // market-regime detection, the turbulence index, the liquidity floor and the
  // manual-trade cached-price fallback all have real data. Without this job the
  // table stays empty and regime is permanently "Sideways" (HOLD-biased).
  cron.schedule('*/10 * * * 1-5', async () => {
    if (!isNseOpen()) return;
    try {
      const stocks = db.prepare(
        `SELECT DISTINCT s.id, s.symbol, s.exchange FROM stocks s
          WHERE s.id IN (SELECT stock_id FROM paper_positions)
             OR s.id IN (SELECT stock_id FROM watchlist)
             OR s.id IN (SELECT stock_id FROM stock_opportunities WHERE created_at >= datetime('now','-2 day'))
             OR s.tier IN ('large','mid')
             OR s.tier IS NULL
          LIMIT 90`,
      ).all() as Array<{ id: number; symbol: string; exchange: string }>;
      if (stocks.length) {
        const r = await snapshotPrices(stocks, 5);
        logger.info({ universe: stocks.length, ...r }, 'Price snapshot complete');
      }
    } catch (e: any) {
      logger.warn({ err: e.message }, 'Price snapshot job failed');
    }
  });

  // Equity curve sampler: every 5 min
  cron.schedule('*/5 * * * *', async () => {
    const accs = db.prepare('SELECT id FROM paper_accounts').all() as { id: number }[];
    for (const a of accs) {
      try { await recomputeEquity(a.id); } catch (e: any) {
        logger.warn({ err: e.message, acc: a.id }, 'recomputeEquity failed');
      }
    }
  });

  // Validate predictions hourly
  cron.schedule('0 * * * *', async () => {
    try {
      const r = await validatePendingPredictions();
      if (r.checked) logger.info(r, 'Prediction validation pass');
    } catch (e: any) {
      logger.warn({ err: e.message }, 'Validation job failed');
    }
  });

  // News refresh every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const items = await fetchMarketNews();
      persistNews(items);
      logger.info({ count: items.length }, 'News refreshed');
    } catch (e: any) {
      logger.warn({ err: e.message }, 'News fetch failed');
    }
  });

  // FinBERT sentiment scoring — every 15 minutes (scores any un-scored headlines)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const scored = await scoreUnscoredNews(50);
      if (scored > 0) logger.info({ scored }, 'FinBERT sentiment scoring pass');
    } catch (e: any) {
      logger.warn({ err: e.message }, 'Sentiment scoring job failed');
    }
  });

  // Phase 6: Update feature reliability weights weekly (Sunday 6 AM IST)
  cron.schedule('0 0 * * 0', () => {
    try {
      updateFeatureWeights();
    } catch (e: any) {
      logger.warn({ err: e.message }, 'Feature weight update failed');
    }
  });

  // Broker sync every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    const users = db.prepare('SELECT DISTINCT user_id FROM broker_accounts WHERE enabled = 1').all() as { user_id: number }[];
    for (const u of users) {
      try { await syncAllBrokersForUser(u.user_id); } catch (e: any) {
        logger.warn({ err: e.message, userId: u.user_id }, 'broker sync job failed');
      }
    }
  });

  // Make sure every existing user has a playground account on first boot
  const users = db.prepare('SELECT id FROM users').all() as { id: number }[];
  for (const u of users) getOrCreateAccount(u.id);

  // ── IPO refresh + AI analysis ─ every 12 hours ──
  const adminUserId = (db.prepare("SELECT id FROM users WHERE role IN ('Super Admin','Admin') ORDER BY id LIMIT 1").get() as { id: number } | undefined)?.id
    ?? (db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined)?.id;
  cron.schedule('0 */12 * * *', async () => {
    if (!adminUserId) return;
    try {
      const r = await refreshIPOs(adminUserId);
      logger.info(r, 'IPO refresh job complete');
    } catch (e: any) { logger.warn({ err: e.message }, 'IPO refresh job failed'); }
  });
  // Kick off one IPO refresh shortly after boot if rows are missing/stale
  setTimeout(async () => {
    if (!adminUserId) return;
    const c = (db.prepare('SELECT COUNT(*) c FROM ipos').get() as { c: number }).c;
    if (c === 0) {
      try { await refreshIPOs(adminUserId); } catch (e: any) { logger.warn({ err: e.message }, 'initial IPO refresh failed'); }
    }
  }, 30_000);

  // ── Discovery scan (cross-cap AI opportunity scanner) ─ every 4 hours ──
  cron.schedule('0 */4 * * *', async () => {
    if (!adminUserId) return;
    try {
      const r = await runDiscoveryScan(adminUserId);
      logger.info(r, 'Discovery scan complete');
    } catch (e: any) { logger.warn({ err: e.message }, 'Discovery scan failed'); }
  });
  // Initial discovery scan ~60s after boot if empty
  setTimeout(async () => {
    if (!adminUserId) return;
    const c = (db.prepare('SELECT COUNT(*) c FROM stock_opportunities').get() as { c: number }).c;
    if (c === 0) {
      try { await runDiscoveryScan(adminUserId); } catch (e: any) { logger.warn({ err: e.message }, 'initial discovery scan failed'); }
    }
  }, 60_000);

  logger.info('Background jobs scheduled');

  // ── Daily backup at 2 AM IST ─────────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    try {
      const { createBackup } = await import('../services/backup.js');
      const r = await createBackup('daily');
      logger.info({ size: r.sizeHuman }, 'Daily backup complete');
    } catch (e: any) { logger.warn({ err: e.message }, 'Daily backup failed'); }
  }, { timezone: 'Asia/Kolkata' });

  // ── Weekly full backup — Sunday 3 AM IST ──────────────────────
  cron.schedule('0 3 * * 0', async () => {
    try {
      const { createBackup } = await import('../services/backup.js');
      const r = await createBackup('weekly');
      logger.info({ size: r.sizeHuman }, 'Weekly backup complete');
    } catch (e: any) { logger.warn({ err: e.message }, 'Weekly backup failed'); }
  }, { timezone: 'Asia/Kolkata' });

  // ── Cleanup expired backups — daily 4 AM IST ──────────────────
  cron.schedule('0 4 * * *', async () => {
    try {
      const { cleanupOldBackups } = await import('../services/backup.js');
      const r = await cleanupOldBackups();
      if (r.deleted > 0) logger.info(r, 'Backup cleanup done');
    } catch (e: any) { logger.warn({ err: e.message }, 'Backup cleanup failed'); }
  }, { timezone: 'Asia/Kolkata' });
}
