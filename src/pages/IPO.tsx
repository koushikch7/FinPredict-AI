import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw, Star, ShieldAlert, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { fmtPct, fmtDateTimeIST } from '../lib/format';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { SortableTable, type Column } from '../components/SortableTable';
import { useToast } from '../lib/toast';

function StarRating({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className="inline-flex items-center gap-0.5" aria-label={`${v} of 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = v >= i + 1;
        const half = !filled && v > i && v < i + 1;
        return (
          <Star
            key={i}
            size={12}
            className={filled ? 'fill-amber-500 text-amber-500' : half ? 'fill-amber-300 text-amber-500' : 'text-amber-200'}
          />
        );
      })}
      <span className="text-[10px] opacity-60 ml-1 font-mono">{v.toFixed(1)}</span>
    </div>
  );
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="opacity-30">—</span>;
  const v = level === 'Low' ? 'success' : level === 'High' ? 'danger' : 'warning';
  return <Badge variant={v as any}>{level}</Badge>;
}

export function IPOPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const refresh = () => {
    api.ipo.list()
      .then((r: any) => setItems(r))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };
  useEffect(() => { refresh(); }, []);

  const refreshAll = async () => {
    setBusy(true);
    try {
      const r = await api.ipo.refreshAll() as any;
      notify(`Fetched ${r.fetched} • analysed ${r.analysed}${r.errors ? ` • ${r.errors} errors` : ''}`);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const reanalyse = async (row: any) => {
    setBusyId(row.id);
    try {
      const r = await api.ipo.analyseOne(row.id) as any;
      notify(`Re-analysed ${row.name}`);
      setAnalysis({ ...row, ...r });
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusyId(null); }
  };

  const view = (row: any) => {
    setAnalysis({
      ...row,
      strengths: safeJSON(row.ai_strengths),
      risks: safeJSON(row.ai_risks),
    });
  };

  const cols: Column<any>[] = [
    { key: 'name', label: 'IPO', sortable: true, sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <div className="font-bold">{r.name}</div>
          <div className="text-[10px] opacity-50">{r.symbol ?? '—'}</div>
        </div>
      ) },
    { key: 'open_date', label: 'Open', sortable: true, sortValue: (r) => r.open_date ?? '', render: (r) => r.open_date ?? '—' },
    { key: 'close_date', label: 'Close', sortable: true, sortValue: (r) => r.close_date ?? '', render: (r) => r.close_date ?? '—' },
    { key: 'price_band', label: 'Price band', render: (r) => r.price_band ?? '—' },
    { key: 'ai_rating', label: 'AI Rating', sortable: true, sortValue: (r) => r.ai_rating ?? -1, render: (r) => <StarRating value={r.ai_rating} /> },
    { key: 'ai_recommendation', label: 'Verdict', sortable: true, sortValue: (r) => r.ai_recommendation ?? '',
      render: (r) => r.ai_recommendation
        ? <Badge variant={r.ai_recommendation === 'SUBSCRIBE' ? 'success' : r.ai_recommendation === 'AVOID' ? 'danger' : 'warning'}>{r.ai_recommendation}</Badge>
        : <span className="opacity-30">—</span> },
    { key: 'ai_risk_level', label: 'Risk', sortable: true, sortValue: (r) => r.ai_risk_level ?? '', render: (r) => <RiskBadge level={r.ai_risk_level} /> },
    { key: 'ai_potential_pct', label: 'Upside', sortable: true, sortValue: (r) => r.ai_potential_pct ?? null, align: 'right',
      render: (r) => r.ai_potential_pct == null
        ? <span className="opacity-30">—</span>
        : <span className={`font-mono font-bold ${r.ai_potential_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtPct(r.ai_potential_pct)}</span> },
    { key: 'ai_horizon', label: 'Horizon', sortable: true, sortValue: (r) => r.ai_horizon ?? '',
      render: (r) => r.ai_horizon ? <Badge>{r.ai_horizon}</Badge> : <span className="opacity-30">—</span> },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div className="flex gap-1 justify-end">
          <Button variant="secondary" onClick={() => view(r)}>View</Button>
          <Button icon={<Sparkles size={12} />} loading={busyId === r.id} onClick={() => reanalyse(r)}>Re-run</Button>
        </div>
      ),
      align: 'right',
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">IPOs</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">
            Upcoming &amp; active issues — auto-refresh + AI analysis every 12 hours
          </p>
        </div>
        <Button icon={<RefreshCw size={14} />} loading={busy} onClick={refreshAll}>Refresh now</Button>
      </header>

      <Card>
        {loading ? (
          <div className="text-center py-8 opacity-50">Loading IPOs…</div>
        ) : (
          <SortableTable
            data={items}
            columns={cols}
            rowKey={(r) => r.id}
            initialSort={{ key: 'ai_rating', dir: 'desc' }}
            emptyMessage="No IPOs yet — click Refresh to fetch and analyse."
          />
        )}
      </Card>

      <Modal open={!!analysis} onClose={() => setAnalysis(null)} title={analysis?.name ?? 'IPO Analysis'} width="max-w-2xl">
        {analysis && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Mini label="Verdict">
                {analysis.ai_recommendation
                  ? <Badge variant={analysis.ai_recommendation === 'SUBSCRIBE' ? 'success' : analysis.ai_recommendation === 'AVOID' ? 'danger' : 'warning'}>{analysis.ai_recommendation}</Badge>
                  : <span className="opacity-30">—</span>}
              </Mini>
              <Mini label="Rating"><StarRating value={analysis.ai_rating ?? analysis.rating} /></Mini>
              <Mini label="Risk"><RiskBadge level={analysis.ai_risk_level ?? analysis.risk_level} /></Mini>
              <Mini label="Upside">
                {analysis.ai_potential_pct != null
                  ? <span className={`font-mono font-bold ${analysis.ai_potential_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtPct(analysis.ai_potential_pct)}</span>
                  : <span className="opacity-30">—</span>}
              </Mini>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <Mini label="Open">{analysis.open_date ?? '—'}</Mini>
              <Mini label="Close">{analysis.close_date ?? '—'}</Mini>
              <Mini label="Price band">{analysis.price_band ?? '—'}</Mini>
              <Mini label="Status">{analysis.status ?? '—'}</Mini>
              <Mini label="Horizon">{analysis.ai_horizon ?? '—'}</Mini>
              <Mini label="Analysed">{analysis.analyzed_at ? fmtDateTimeIST(analysis.analyzed_at) : '—'}</Mini>
            </div>
            {analysis.ai_summary && (
              <div>
                <h4 className="col-header mb-1">Summary</h4>
                <p className="text-sm leading-relaxed">{analysis.ai_summary}</p>
              </div>
            )}
            {analysis.ai_analyst_view && (
              <div>
                <h4 className="col-header mb-1">Analyst consensus</h4>
                <p className="text-sm italic opacity-80">{analysis.ai_analyst_view}</p>
              </div>
            )}
            {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 && (
              <div>
                <h4 className="col-header mb-1 flex items-center gap-1"><TrendingUp size={12} className="text-emerald-700" /> Strengths</h4>
                <ul className="list-disc pl-5 text-sm space-y-1">{analysis.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
            {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
              <div>
                <h4 className="col-header mb-1 flex items-center gap-1"><ShieldAlert size={12} className="text-rose-700" /> Risks</h4>
                <ul className="list-disc pl-5 text-sm space-y-1">{analysis.risks.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-[#141414]/10 bg-[#F8F7F4] p-2">
      <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function safeJSON(s: any): any[] {
  if (!s) return [];
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
