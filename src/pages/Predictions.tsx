import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Sparkles, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { fmtPct, fmtINR, fmtDate } from '../lib/format';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Field, Select } from '../components/Field';
import { useToast } from '../lib/toast';

export function PredictionsPage() {
  const { notify } = useToast();
  const [predictions, setPredictions] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<string[]>([]);
  const [accuracy, setAccuracy] = useState<any>(null);
  const [form, setForm] = useState({ stock_id: '', horizon: '2-7d', strategy: 'Balanced' });
  const [busy, setBusy] = useState(false);
  const [picksBusy, setPicksBusy] = useState(false);
  const [topPicks, setTopPicks] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<'date' | 'profit'>('date');

  const refresh = () => {
    api.predictions.list(sortBy === 'profit' ? 'profit' : undefined).then(setPredictions).catch(() => setPredictions([]));
    api.predictions.accuracy().then(setAccuracy).catch(() => null);
  };

  useEffect(() => {
    api.stocks.list().then(setStocks).catch(() => setStocks([]));
    api.predictions.strategies().then((s: any) => setStrategies(s)).catch(() => setStrategies([]));
  }, []);
  useEffect(refresh, [sortBy]);

  const generate = async () => {
    if (!form.stock_id) return;
    setBusy(true);
    try {
      const r: any = await api.predictions.generate({
        stock_id: Number(form.stock_id),
        horizon: form.horizon,
        strategy: form.strategy,
      });
      notify(`Prediction generated • confidence ${(r.result.confidence * 100).toFixed(0)}%`);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const findTopPicks = async () => {
    setPicksBusy(true);
    try {
      const r: any = await api.predictions.topPicks(5, form.horizon);
      setTopPicks(r.picks ?? []);
      notify(`Top ${r.count ?? 0} picks generated`);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setPicksBusy(false); }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Predictions</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">AI-driven multi-strategy forecasting</p>
        </div>
        <div className="flex gap-2">
          {(['date', 'profit'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 border border-[#141414] ${
                sortBy === s ? 'bg-[#141414] text-[#F8F7F4]' : ''
              }`}
            >
              {s === 'date' ? 'Latest' : 'Top expected'}
            </button>
          ))}
        </div>
      </header>

      {accuracy && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPI label="Total" value={accuracy.total ?? 0} />
          <KPI label="Pending" value={accuracy.pending ?? 0} />
          <KPI label="Accurate" value={accuracy.accurate ?? 0} />
          <KPI label="Failed" value={accuracy.failed ?? 0} />
          <KPI label="Accuracy" value={accuracy.accuracy_pct == null ? '—' : `${accuracy.accuracy_pct.toFixed(1)}%`} />
        </div>
      )}

      <Card title="Generate Analysis" subtitle="Synthesises live price, technicals & news with the chosen investor lens">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Field label="Symbol">
            <Select value={form.stock_id} onChange={(e) => setForm({ ...form, stock_id: e.target.value })}>
              <option value="">Select…</option>
              {stocks.map((s: any) => <option key={s.id} value={s.id}>{s.symbol} — {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Horizon">
            <Select value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value })}>
              <option value="2-7d">Short (2-7 days)</option>
              <option value="1m">Medium (1 month)</option>
              <option value="3-12m">Long (3-12 months)</option>
              <option value="LT">Multi-Year</option>
            </Select>
          </Field>
          <Field label="Strategy / Lens">
            <Select value={form.strategy} onChange={(e) => setForm({ ...form, strategy: e.target.value })}>
              {strategies.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Button onClick={generate} loading={busy} disabled={!form.stock_id} icon={<Sparkles size={14} />}>
            Run Analysis
          </Button>
        </div>
        <div className="mt-4 pt-4 border-t border-[#141414]/10 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-widest text-[#141414]/60">
            Or: rank your watchlist + universe by AI conviction (Balanced lens, current horizon)
          </div>
          <Button onClick={findTopPicks} loading={picksBusy} variant="secondary" icon={<Trophy size={14} />}>
            Find Top Picks
          </Button>
        </div>
      </Card>

      {topPicks.length > 0 && (
        <Card title="Top Picks" subtitle={`Ranked by confidence × |expected move| • ${form.horizon}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topPicks.map((p, i) => (
              <div key={p.id ?? i} className="border border-[#141414]/10 p-4 flex flex-col gap-2 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/50">#{i + 1}</span>
                  <span className="text-xl font-display font-black tracking-tighter">{p.symbol}</span>
                  <Badge variant={p.direction === 'UP' ? 'success' : p.direction === 'DOWN' ? 'danger' : 'warning'}>
                    {p.direction} {fmtPct(p.expected_move_p)}
                  </Badge>
                  <Badge>Score {p.score?.toFixed(1)}</Badge>
                </div>
                <div className="text-xs text-[#141414]/70 italic">"{p.explanation}"</div>
                <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-widest text-[#141414]/50">
                  <span>Confidence <b className="text-[#141414]">{(p.confidence * 100).toFixed(0)}%</b></span>
                  <span>Target <b className="text-[#141414]">{fmtINR(p.target_price)}</b></span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4">
        {predictions.length === 0 ? (
          <Card><div className="text-center py-12 text-sm opacity-50">No predictions yet.</div></Card>
        ) : (
          predictions.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-col md:flex-row gap-6 justify-between">
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-2xl font-display font-black tracking-tighter">{p.symbol}</span>
                    {p.direction === 'UP' ? (
                      <Badge variant="success"><TrendingUp size={10} className="inline mr-1" />UP {fmtPct(p.expected_move_p)}</Badge>
                    ) : p.direction === 'DOWN' ? (
                      <Badge variant="danger"><TrendingDown size={10} className="inline mr-1" />DOWN {fmtPct(p.expected_move_p)}</Badge>
                    ) : (
                      <Badge variant="warning"><Activity size={10} className="inline mr-1" />SIDEWAYS</Badge>
                    )}
                    <Badge>{p.horizon}</Badge>
                    {p.strategy && <Badge variant="info">{p.strategy}</Badge>}
                    {p.target_price ? <Badge>Target {fmtINR(p.target_price)}</Badge> : null}
                  </div>
                  <p className="text-sm text-[#141414]/80 leading-relaxed italic">"{p.ai_explanation}"</p>
                  <div className="flex flex-wrap gap-4 text-[10px] uppercase tracking-widest text-[#141414]/50">
                    <span>Confidence <b className="text-[#141414]">{(p.confidence * 100).toFixed(0)}%</b></span>
                    <span>Model <b className="text-[#141414]">{p.model_version}</b></span>
                    <span>Created <b className="text-[#141414]">{fmtDate(p.created_at)}</b></span>
                    {p.actual_move_p != null && <span>Actual <b className="text-[#141414]">{fmtPct(p.actual_move_p)}</b></span>}
                  </div>
                </div>
                <div className="md:border-l md:pl-6 border-[#141414]/10 min-w-[120px] flex flex-col items-start md:items-end justify-center">
                  <div className="col-header mb-1">Status</div>
                  <Badge
                    variant={p.result === 'ACCURATE' ? 'success' : p.result === 'FAILED' ? 'danger' : p.result === 'PARTIAL' ? 'warning' : 'neutral'}
                  >
                    {p.status === 'PENDING' ? 'Pending' : p.result ?? 'Validated'}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

function KPI({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#141414]/10 p-4">
      <div className="col-header mb-1">{label}</div>
      <div className="text-2xl font-display font-black tracking-tighter">{value}</div>
    </div>
  );
}
