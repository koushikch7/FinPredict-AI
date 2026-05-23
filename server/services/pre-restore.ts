/**
 * Pre-start database restore hook.
 *
 * This module MUST NOT import from '../db/index.js' or anything that
 * transitively opens the database, because it needs to rename the file
 * BEFORE better-sqlite3 acquires a file descriptor.
 *
 * Called from a dynamic import() in server/index.ts before any static
 * db imports are evaluated.
 */
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';

export function applyPendingRestore(): void {
  const dbPath = path.resolve(config.DB_PATH);
  const dbDir  = path.dirname(dbPath);
  const restoreFile = path.join(dbDir, 'finance.db.restore');
  const pendingFlag = path.join(dbDir, '.restore-pending');

  // Both files must exist — if only .restore exists without the flag,
  // it may be a leftover from a failed restore attempt; remove it.
  if (!fs.existsSync(restoreFile)) return;
  if (!fs.existsSync(pendingFlag)) {
    try { fs.unlinkSync(restoreFile); } catch {}
    return;
  }

  // Preserve a pre-restore snapshot just in case
  try { fs.renameSync(dbPath, dbPath + '.pre-restore'); } catch {}
  // Remove stale WAL / SHM belonging to the old database
  try { fs.unlinkSync(dbPath + '-wal'); } catch {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch {}

  fs.renameSync(restoreFile, dbPath);
  const restoredFrom = fs.readFileSync(pendingFlag, 'utf8');
  try { fs.unlinkSync(pendingFlag); } catch {}
  // eslint-disable-next-line no-console
  console.log(`[finpredict] ✓ Database restored from: ${restoredFrom}`);
}
