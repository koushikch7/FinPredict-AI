import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler } from '../utils/async-handler.js';
import { badRequest, notFound } from '../utils/errors.js';
import {
  createBackup,
  listBackups,
  getStorageStats,
  restoreBackup,
  deleteBackup,
  cleanupOldBackups,
  isS3Configured,
  type BackupType,
} from '../services/backup.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export const backupRouter = Router();
backupRouter.use(authenticate);
backupRouter.use(authorize(['Admin', 'Super Admin']));

backupRouter.get(
  '/status',
  asyncHandler(async (_req, res) => {
    res.json({ configured: isS3Configured() });
  }),
);

backupRouter.get(
  '/list',
  asyncHandler(async (_req, res) => {
    res.json({ backups: await listBackups() });
  }),
);

backupRouter.get(
  '/storage',
  asyncHandler(async (_req, res) => {
    res.json(await getStorageStats());
  }),
);

backupRouter.post(
  '/create',
  asyncHandler(async (req, res) => {
    const type = ((req.body as any)?.type ?? 'manual') as BackupType;
    if (!['daily', 'weekly', 'manual'].includes(type)) throw badRequest('Invalid backup type');
    const backup = await createBackup(type);
    res.json({ ok: true, backup });
  }),
);

backupRouter.post(
  '/restore',
  asyncHandler(async (req, res) => {
    const key = (req.body as any)?.key as string;
    if (!key) throw badRequest('Backup key required');
    if (!key.startsWith(config.S3_PREFIX + '/')) throw badRequest('Invalid backup key');

    // Validate the key exists before triggering a restart
    const backups = await listBackups();
    if (!backups.find((b) => b.key === key)) throw notFound('Backup not found');

    // Respond before the 500 ms process.exit fires
    res.json({ ok: true, message: 'Restore initiated — server will restart in a few seconds.' });
    setImmediate(() =>
      restoreBackup(key).catch((e) =>
        logger.error({ err: e.message }, 'Restore failed post-response'),
      ),
    );
  }),
);

backupRouter.post(
  '/delete',
  asyncHandler(async (req, res) => {
    const key = (req.body as any)?.key as string;
    if (!key) throw badRequest('Backup key required');
    if (!key.startsWith(config.S3_PREFIX + '/')) throw badRequest('Invalid backup key');
    await deleteBackup(key);
    res.json({ ok: true });
  }),
);

backupRouter.post(
  '/cleanup',
  asyncHandler(async (_req, res) => {
    const result = await cleanupOldBackups();
    res.json({ ok: true, ...result });
  }),
);
