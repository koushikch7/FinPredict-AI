import cron from 'node-cron';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runAITraderCycle, recomputeEquity, getOrCreateAccount } from '../services/paper-trading.js';
import { validatePendingPredictions } from '../services/predictions.js';
import { fetchMarketNews, persistNews } from '../services/news.js';
import { syncAllBrokersForUser } from '../services/portfolio-sync.js';
import { isNseOpen } from '../utils/market-hours.js';
import { refreshIPOs } from '../services/ipo.js';
import { runDiscoveryScan } from '../services/discovery.js';

let started = false;

export function startJobs() {
  if (started) return;
  started = true;

  // Playground AI trader: every N minutes during NSE hours
  cron.schedule(config.PLAYGROUND_CRON, async () => {
    if (!isNseOpen()) return;
    const users = db.prepare('SELECT user_id FROM paper_accounts WHERE auto_trade = 1').all() as { user_id: number }[];
    for (const u of users) {
      try {
        const r = await runAITraderCycle(u.user_id);
        logger.info({ userId: u.user_id, executed: r.executed, errors: r.errors.length }, 'AI trader cycle');
      } catch (e: any) {
        logger.error({ err: e.message, userId: u.user_id }, 'AI trader cycle failed');
      }
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
}
