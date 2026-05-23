import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { useToast } from '../lib/toast';
import {
  HardDrive,
  RefreshCw,
  ArchiveRestore,
  Trash2,
  CloudUpload,
  AlertTriangle,
  XCircle,
  Clock,
} from 'lucide-react';

type BackupType = 'daily' | 'weekly' | 'manual';
interface BackupEntry {
  key: string;
  type: BackupType;
  filename: string;
  timestamp: string;
  timestampIST: string;
  sizeBytes: number;
  sizeHuman: string;
}
interface StorageStats {
  usedBytes: number;
  limitBytes: number;
  usedHuman: string;
  limitHuman: string;
  percentUsed: number;
  limitExceeded: boolean;
  warning: boolean;
  count: { daily: number; weekly: number; manual: number; total: number };
}

function TypeBadge({ type }: { type: BackupType }) {
  const styles: Record<BackupType, string> = {
    daily:  'text-sky-600 bg-sky-50 border-sky-200',
    weekly: 'text-violet-600 bg-violet-50 border-violet-200',
    manual: 'text-amber-600 bg-amber-50 border-amber-200',
  };
  return (
    <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded border ${styles[type]}`}>
      {type}
    </span>
  );
}

export function BackupsPage() {
  const { notify } = useToast();
  const [backups, setBackups]       = useState<BackupEntry[]>([]);
  const [stats, setStats]           = useState<StorageStats | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [filter, setFilter]         = useState<'all' | BackupType>('all');
  const [loading, setLoading]       = useState(true);
  const [busy, setBusy]             = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<BackupEntry | null>(null);
  const [confirmDelete, setConfirmDelete]   = useState<BackupEntry | null>(null);
  const [createType, setCreateType]         = useState<BackupType>('manual');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { configured: cfg } = (await api.backup.status()) as any;
      setConfigured(cfg);
      if (cfg) {
        const [{ backups: bkps }, sts] = await Promise.all([
          api.backup.list() as any,
          api.backup.storage() as any,
        ]);
        setBackups(bkps ?? []);
        setStats(sts);
      }
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    setBusy('create');
    try {
      const r: any = await api.backup.create(createType);
      notify(`Backup created — ${r.backup.sizeHuman}`, 'success');
      refresh();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async (b: BackupEntry) => {
    setBusy('restore-' + b.key);
    setConfirmRestore(null);
    try {
      await api.backup.restore(b.key);
      notify('Restore initiated — app will restart in ~5 seconds. Hard-refresh after it comes back.', 'success');
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (b: BackupEntry) => {
    setBusy('delete-' + b.key);
    setConfirmDelete(null);
    try {
      await api.backup.delete(b.key);
      notify('Backup deleted');
      refresh();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleCleanup = async () => {
    setBusy('cleanup');
    try {
      const r: any = await api.backup.cleanup();
      notify(
        r.deleted > 0
          ? `Removed ${r.deleted} old backup${r.deleted > 1 ? 's' : ''} — freed ${r.freedHuman}`
          : 'Nothing to clean up',
      );
      refresh();
    } catch (e: any) {
      notify(e.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const barColor = !stats
    ? 'bg-emerald-500'
    : stats.limitExceeded
    ? 'bg-red-500'
    : stats.warning
    ? 'bg-amber-400'
    : 'bg-emerald-500';

  const filtered = filter === 'all' ? backups : backups.filter((b) => b.type === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">
          Backups
        </h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">
          Enterprise database backup &amp; restore
        </p>
      </header>

      {/* Not configured */}
      {configured === false && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-bold text-amber-800 text-sm">S3 backup not configured</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Add S3 credentials to your <code>.env</code> file and restart the server.
            </p>
          </div>
        </div>
      )}

      {/* Storage alerts */}
      {stats?.limitExceeded && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg p-4">
          <XCircle size={18} className="text-red-500 shrink-0" />
          <p className="font-bold text-red-800 text-sm">
            Storage limit exceeded — {stats.usedHuman} of {stats.limitHuman} used ({stats.percentUsed}%).
            Delete old backups or run cleanup immediately.
          </p>
        </div>
      )}
      {stats?.warning && !stats.limitExceeded && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <AlertTriangle size={18} className="text-amber-500 shrink-0" />
          <p className="font-bold text-amber-800 text-sm">
            Storage warning — {stats.usedHuman} of {stats.limitHuman} used ({stats.percentUsed}%).
            Consider running cleanup.
          </p>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Storage usage */}
        <Card title="Storage Usage">
          {stats ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm font-bold">
                <span>{stats.usedHuman}</span>
                <span className="opacity-50">/ {stats.limitHuman} limit</span>
              </div>
              <div className="h-3 bg-[#141414]/10 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${stats.percentUsed}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-4 text-xs opacity-60">
                <span>
                  <strong className="text-sky-600">{stats.count.daily}</strong> daily
                </span>
                <span>
                  <strong className="text-violet-600">{stats.count.weekly}</strong> weekly
                </span>
                <span>
                  <strong className="text-amber-600">{stats.count.manual}</strong> manual
                </span>
                <span>
                  <strong>{stats.count.total}</strong> total
                </span>
              </div>
            </div>
          ) : (
            <div className="h-10 opacity-40 text-sm flex items-center">
              {loading ? 'Loading…' : '—'}
            </div>
          )}
        </Card>

        {/* Schedule info */}
        <Card title="Backup Schedule">
          <div className="space-y-2 text-sm">
            {(
              [
                ['Daily',   '2:00 AM IST',       '7-day retention',  'text-sky-600'],
                ['Weekly',  'Sunday 3:00 AM IST', '90-day retention', 'text-violet-600'],
                ['Cleanup', 'Daily 4:00 AM IST',  'auto-removes expired', 'text-slate-400'],
              ] as const
            ).map(([label, time, note, cls]) => (
              <div key={label} className="flex items-center gap-3">
                <Clock size={13} className={cls} />
                <span className="font-bold w-16">{label}</span>
                <span className="opacity-70 text-xs">{time}</span>
                <span className="opacity-40 text-xs ml-auto">{note}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Actions */}
      {configured && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 border border-[#141414]/15 rounded px-3 py-2">
            <span className="text-xs opacity-60 uppercase tracking-widest">Type</span>
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value as BackupType)}
              className="text-sm font-bold bg-transparent outline-none"
            >
              <option value="manual">Manual</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          <Button
            icon={<CloudUpload size={14} />}
            loading={busy === 'create'}
            onClick={handleCreate}
          >
            Create Backup
          </Button>
          <Button
            variant="secondary"
            icon={<Trash2 size={14} />}
            loading={busy === 'cleanup'}
            onClick={handleCleanup}
          >
            Run Cleanup
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={refresh}>
            Refresh
          </Button>
        </div>
      )}

      {/* Filter tabs */}
      {configured && backups.length > 0 && (
        <div className="flex gap-1 border-b border-[#141414]/10 pb-3">
          {(['all', 'daily', 'weekly', 'manual'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[10px] uppercase tracking-widest font-bold px-4 py-2 ${
                filter === f ? 'bg-[#141414] text-[#F8F7F4]' : 'opacity-40 hover:opacity-70'
              }`}
            >
              {f}
              {f !== 'all' && stats ? ` (${stats.count[f]})` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Backup list */}
      {configured && (
        <Card title={filtered.length > 0 ? `Backups (${filtered.length})` : 'Backups'}>
          {loading ? (
            <div className="text-center py-10 opacity-40 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 opacity-40 text-sm flex flex-col items-center gap-2">
              <HardDrive size={24} />
              <p>No backups yet. Create your first backup above.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#141414]/5">
              {filtered.map((b) => (
                <div key={b.key} className="flex items-center gap-3 py-3">
                  <TypeBadge type={b.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-bold truncate">{b.timestampIST}</p>
                    <p className="text-[10px] opacity-30 truncate">{b.key}</p>
                  </div>
                  <span className="text-xs font-mono opacity-60 shrink-0">{b.sizeHuman}</span>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => setConfirmRestore(b)}
                      disabled={!!busy}
                      title="Restore this backup"
                      className="p-1.5 rounded hover:bg-indigo-50 text-indigo-500 disabled:opacity-30 transition-colors"
                    >
                      <ArchiveRestore size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(b)}
                      disabled={!!busy}
                      title="Delete this backup"
                      className="p-1.5 rounded hover:bg-red-50 text-red-400 disabled:opacity-30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Restore confirmation modal */}
      {confirmRestore && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <ArchiveRestore size={20} className="text-indigo-500" />
              <h3 className="font-black text-lg">Restore Backup?</h3>
            </div>
            <p className="text-sm opacity-70">This will replace the current live database with:</p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-mono font-bold">
              {confirmRestore.timestampIST}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-700">
              <strong>⚠ The server will restart automatically</strong> (~5 seconds downtime).
              A <code>.pre-restore</code> backup of the current DB is kept on disk as a safety net.
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                loading={busy === 'restore-' + confirmRestore.key}
                onClick={() => handleRestore(confirmRestore)}
              >
                Yes, Restore
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmRestore(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <Trash2 size={20} className="text-red-500" />
              <h3 className="font-black text-lg">Delete Backup?</h3>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-mono">
              {confirmDelete.timestampIST}
              <span className="ml-2 opacity-50">({confirmDelete.sizeHuman})</span>
            </div>
            <p className="text-xs text-red-500 font-bold">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button
                className="flex-1 !bg-red-500 hover:!bg-red-600"
                loading={busy === 'delete-' + confirmDelete.key}
                onClick={() => handleDelete(confirmDelete)}
              >
                Delete Permanently
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
