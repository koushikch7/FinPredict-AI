import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Star, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { fmtINR, fmtPct } from '../lib/format';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { SortableTable, type Column } from '../components/SortableTable';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { useToast } from '../lib/toast';

const TIER_VARIANT: Record<string, any> = {
  large: 'success', mid: 'info', small: 'warning', micro: 'warning', penny: 'danger', etf: 'neutral', index: 'neutral',
};

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="opacity-30">—</span>;
  const v = level === 'Low' ? 'success' : level === 'High' ? 'danger' : 'warning';
  return <Badge variant={v as any}>{level}</Badge>;
}

export function DiscoveryPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'HOLD' | 'AVOID'>('BUY');

  const refresh = (dir: 'ALL' | 'BUY' | 'HOLD' | 'AVOID' = filter) => {
    api.discovery.list(100, dir === 'ALL' ? undefined : dir).then(setItems).catch(() => setItems([]));
  };
  useEffect(() => { refresh(filter); /* eslint-disable-next-line */ }, [filter]);
  // Live polling — opportunities don't change minute to minute, but refresh on tab focus
  useAutoRefresh(() => refresh(filter), 120_000, [filter]);

  const scan = async () => {
    setBusy(true);
    try {
      const r = await api.discovery.scan() as any;
      notify(`Scanned ${r.scanned} • wrote ${r.written} opportunities${r.errors ? ` • ${r.errors} errors` : ''}`);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const addToWatchlist = async (row: any) => {
    try {
      await api.watchlist.add({ stock_id: row.stock_id, note: `Discovery: ${row.direction} • ${row.horizon}` });
      notify(`${row.symbol} added to watchlist`);
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const cols: Column<any>[] = [
    {
      key: 'symbol', label: 'Symbol', sortable: true, sortValue: (r) => r.symbol,
      render: (r) => (
        <div>
          <div className="font-bold flex items-center gap-2">
            {r.symbol}
            {r.tier && <Badge variant={TIER_VARIANT[r.tier] ?? 'neutral'}>{r.tier}</Badge>}
          </div>
          <div className="text-[10px] opacity-50">{r.name} • {r.sector}</div>
        </div>
      ),
    },
    {
      key: 'score', label: 'Score', sortable: true, sortValue: (r) => r.score, align: 'right',
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <Star size={12} className="text-amber-500 fill-amber-500" />
          <span className="font-mono font-bold">{Math.round(r.score)}</span>
        </div>
      ),
    },
    {
      key: 'direction', label: 'Action', sortable: true, sortValue: (r) => r.direction,
      render: (r) => <Badge variant={r.direction === 'BUY' ? 'success' : r.direction === 'AVOID' ? 'danger' : 'warning'}>{r.direction}</Badge>,
    },
    {
      key: 'horizon', label: 'Horizon', sortable: true, sortValue: (r) => r.horizon,
      render: (r) => <Badge variant={r.horizon === 'Intraday' ? 'warning' : r.horizon === 'Long-term' ? 'success' : 'info'}>{r.horizon}</Badge>,
    },
    {
      key: 'expected_upside_pct', label: 'Upside', sortable: true, sortValue: (r) => r.expected_upside_pct, align: 'right',
      render: (r) => <span className={`font-mono font-bold ${r.expected_upside_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtPct(r.expected_upside_pct)}</span>,
    },
    { key: 'risk_level', label: 'Risk', sortable: true, sortValue: (r) => r.risk_level, render: (r) => <RiskBadge level={r.risk_level} /> },
    { key: 'strategy', label: 'Strategy', render: (r) => <span className="text-[11px] opacity-70">{r.strategy ?? '—'}</span> },
    {
      key: 'rationale', label: 'Rationale',
      render: (r) => <div className="text-[11px] opacity-80 max-w-[420px] truncate" title={r.rationale}>{r.rationale ?? '—'}</div>,
    },
    {
      key: 'actions', label: '', align: 'right',
      render: (r) => (
        <Button variant="secondary" icon={<Plus size={12} />} onClick={() => addToWatchlist(r)}>Watchlist</Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Discovery</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">
            AI-scored opportunities across large-cap → penny stocks &amp; ETFs • re-scanned every 4 hours
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex border border-[#141414]/20 bg-white">
            {(['BUY', 'HOLD', 'AVOID', 'ALL'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold ${filter === f ? 'bg-[#141414] text-white' : 'opacity-60 hover:opacity-100'}`}
              >{f}</button>
            ))}
          </div>
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={() => refresh(filter)}>Reload</Button>
          <Button icon={<Sparkles size={14} />} loading={busy} onClick={scan}>Run AI Scan</Button>
        </div>
      </header>

      <Card>
        <SortableTable
          data={items}
          columns={cols}
          rowKey={(r) => r.id}
          initialSort={{ key: 'score', dir: 'desc' }}
          emptyMessage="No opportunities yet — click Run AI Scan to populate. The first scheduled scan runs ~1 minute after server boot."
        />
      </Card>

      <p className="text-[11px] opacity-60">
        ⓘ The Playground AI trader pulls from this list automatically when your <strong>universe is empty (Auto mode)</strong>. Add stocks here to your watchlist to bias the trader towards them.
      </p>
    </div>
  );
}
