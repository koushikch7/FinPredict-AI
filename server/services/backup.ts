import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { createGzip, createGunzip } from 'zlib';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

export type BackupType = 'daily' | 'weekly' | 'manual';

export interface BackupEntry {
  key: string;
  type: BackupType;
  filename: string;
  timestamp: string;     // ISO 8601 UTC
  timestampIST: string;  // human-readable IST e.g. "2026-05-01 02:00:00 IST"
  sizeBytes: number;
  sizeHuman: string;
}

export interface StorageStats {
  usedBytes: number;
  limitBytes: number;
  usedHuman: string;
  limitHuman: string;
  percentUsed: number;
  limitExceeded: boolean;
  warning: boolean; // > 80% threshold
  count: { daily: number; weekly: number; manual: number; total: number };
}

export interface CleanupResult {
  deleted: number;
  freedBytes: number;
  freedHuman: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function buildFilename(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}_` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}_IST.db.gz`
  );
}

function parseKey(key: string): { iso: string; ist: string; type: BackupType } {
  const fn = path.basename(key, '.db.gz');
  const m = fn.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_IST$/);
  const type: BackupType = key.includes('/weekly/') ? 'weekly' : key.includes('/daily/') ? 'daily' : 'manual';
  if (!m) return { iso: new Date().toISOString(), ist: fn, type };
  const [, yr, mo, dy, hh, mm, ss] = m;
  const iso = new Date(`${yr}-${mo}-${dy}T${hh}:${mm}:${ss}+05:30`).toISOString();
  return { iso, ist: `${yr}-${mo}-${dy} ${hh}:${mm}:${ss} IST`, type };
}

function makeS3(): S3Client {
  return new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
    },
    forcePathStyle: true, // required for OCI / non-AWS S3-compatible endpoints
  });
}

export function isS3Configured(): boolean {
  return !!(
    config.S3_ENDPOINT &&
    config.S3_BUCKET &&
    config.S3_ACCESS_KEY &&
    config.S3_SECRET_KEY
  );
}

// ─── core operations ─────────────────────────────────────────────────────────

/**
 * Hot-backup the SQLite DB (no write lock), gzip it, and upload to S3.
 * Uses SQLite Online Backup API — safe while the server is running.
 */
export async function createBackup(type: BackupType): Promise<BackupEntry> {
  if (!isS3Configured()) throw new Error('S3 backup not configured');

  const filename = buildFilename();
  const s3Key = `${config.S3_PREFIX}/${type}/${filename}`;
  const tmpDb = path.join(os.tmpdir(), `fp-backup-${Date.now()}.db`);
  const tmpGz = tmpDb + '.gz';

  try {
    // SQLite online backup — copies pages while WAL is intact, no lock needed
    await db.backup(tmpDb);

    // Compress at level 9 — SQLite files typically shrink 70-90%
    await pipeline(createReadStream(tmpDb), createGzip({ level: 9 }), createWriteStream(tmpGz));

    const gzBuf = fs.readFileSync(tmpGz);
    await makeS3().send(
      new PutObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: s3Key,
        Body: gzBuf,
        ContentLength: gzBuf.length,
        ContentType: 'application/gzip',
        Metadata: {
          'backup-type': type,
          'backup-created': new Date().toISOString(),
          'db-size-uncompressed': String(fs.statSync(tmpDb).size),
        },
      }),
    );

    const { iso, ist } = parseKey(s3Key);
    const entry: BackupEntry = {
      key: s3Key,
      type,
      filename,
      timestamp: iso,
      timestampIST: ist,
      sizeBytes: gzBuf.length,
      sizeHuman: formatBytes(gzBuf.length),
    };
    logger.info({ type, key: s3Key, size: entry.sizeHuman }, 'Backup created');
    return entry;
  } finally {
    try { fs.unlinkSync(tmpDb); } catch {}
    try { fs.unlinkSync(tmpGz); } catch {}
  }
}

export async function listBackups(): Promise<BackupEntry[]> {
  if (!isS3Configured()) throw new Error('S3 backup not configured');

  const s3 = makeS3();
  const items: BackupEntry[] = [];
  let token: string | undefined;

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.S3_BUCKET,
        Prefix: `${config.S3_PREFIX}/`,
        ContinuationToken: token,
      }),
    );
    for (const obj of resp.Contents ?? []) {
      if (!obj.Key?.endsWith('.db.gz')) continue;
      const { iso, ist, type } = parseKey(obj.Key);
      items.push({
        key: obj.Key,
        type,
        filename: path.basename(obj.Key),
        timestamp: iso,
        timestampIST: ist,
        sizeBytes: obj.Size ?? 0,
        sizeHuman: formatBytes(obj.Size ?? 0),
      });
    }
    token = resp.NextContinuationToken;
  } while (token);

  return items.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export async function getStorageStats(): Promise<StorageStats> {
  const limitBytes = config.BACKUP_STORAGE_LIMIT_GB * 1024 * 1024 * 1024;
  if (!isS3Configured()) {
    return {
      usedBytes: 0, limitBytes,
      usedHuman: '0 B', limitHuman: formatBytes(limitBytes),
      percentUsed: 0, limitExceeded: false, warning: false,
      count: { daily: 0, weekly: 0, manual: 0, total: 0 },
    };
  }
  const backups = await listBackups();
  const usedBytes = backups.reduce((s, b) => s + b.sizeBytes, 0);
  const percentUsed = Math.min(Math.round((usedBytes / limitBytes) * 100), 100);
  return {
    usedBytes, limitBytes,
    usedHuman: formatBytes(usedBytes),
    limitHuman: formatBytes(limitBytes),
    percentUsed,
    limitExceeded: usedBytes >= limitBytes,
    warning: percentUsed >= 80,
    count: {
      daily:  backups.filter((b) => b.type === 'daily').length,
      weekly: backups.filter((b) => b.type === 'weekly').length,
      manual: backups.filter((b) => b.type === 'manual').length,
      total:  backups.length,
    },
  };
}

/**
 * Download a backup from S3, decompress it, validate it as SQLite, then
 * write a .restore-pending flag file. On next server start the pending
 * restore is applied before better-sqlite3 opens the database.
 */
export async function restoreBackup(key: string): Promise<void> {
  if (!isS3Configured()) throw new Error('S3 backup not configured');

  const dbDir = path.dirname(path.resolve(config.DB_PATH));
  const restoreDest = path.join(dbDir, 'finance.db.restore');
  const pendingFlag = path.join(dbDir, '.restore-pending');
  const tmpGz = path.join(os.tmpdir(), `fp-restore-${Date.now()}.db.gz`);

  const resp = await makeS3().send(
    new GetObjectCommand({ Bucket: config.S3_BUCKET, Key: key }),
  );
  if (!resp.Body) throw new Error('Empty S3 response');

  await pipeline(resp.Body as Readable, createWriteStream(tmpGz));
  await pipeline(createReadStream(tmpGz), createGunzip(), createWriteStream(restoreDest));
  try { fs.unlinkSync(tmpGz); } catch {}

  // Validate the decompressed file is a readable SQLite database
  const testDb = new Database(restoreDest, { readonly: true });
  testDb.prepare('SELECT COUNT(*) FROM users').get();
  testDb.close();

  fs.writeFileSync(pendingFlag, key, 'utf8');
  logger.info({ key }, 'Restore pending — restarting server');
  // Give the HTTP response time to reach the client before exiting
  setTimeout(() => process.exit(0), 500);
}

export async function deleteBackup(key: string): Promise<void> {
  if (!isS3Configured()) throw new Error('S3 backup not configured');
  await makeS3().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
  logger.info({ key }, 'Backup deleted');
}

/**
 * Retention policy:
 *   - daily backups   older than  7 days  → delete
 *   - weekly backups  older than 90 days  → delete
 *   - manual backups  never auto-deleted
 */
export async function cleanupOldBackups(): Promise<CleanupResult> {
  if (!isS3Configured()) return { deleted: 0, freedBytes: 0, freedHuman: '0 B' };

  const now = Date.now();
  const DAILY_TTL  =  7 * 24 * 60 * 60 * 1000;
  const WEEKLY_TTL = 90 * 24 * 60 * 60 * 1000;

  const backups = await listBackups();
  let deleted = 0;
  let freedBytes = 0;

  for (const b of backups) {
    const age = now - new Date(b.timestamp).getTime();
    const expired =
      (b.type === 'daily'  && age > DAILY_TTL)  ||
      (b.type === 'weekly' && age > WEEKLY_TTL);
    if (expired) {
      await deleteBackup(b.key);
      deleted++;
      freedBytes += b.sizeBytes;
    }
  }
  if (deleted > 0) {
    logger.info({ deleted, freedMB: (freedBytes / 1024 / 1024).toFixed(1) }, 'Old backups cleaned');
  }
  return { deleted, freedBytes, freedHuman: formatBytes(freedBytes) };
}
