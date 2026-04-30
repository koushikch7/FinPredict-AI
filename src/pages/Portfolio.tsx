import { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { fmtINR, fmtPct } from '../lib/format';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Field, Input, Select } from '../components/Field';
import { SortableTable, type Column } from '../components/SortableTable';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { useToast } from '../lib/toast';

export function PortfolioPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ stock_id: '', quantity: '', average_price: '' });

  const refresh = () => {
    api.portfolio.list().then(setItems).catch(() => setItems([]));
    api.stocks.list().then(setStocks).catch(() => setStocks([]));
  };
  useEffect(() => { refresh(); }, []);
  // Live updates: every 30s while market is open, poll for fresh LTP/P&L
  useAutoRefresh(() => api.portfolio.list().then(setItems).catch(() => {}), 30_000);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.portfolio.add({
        stock_id: Number(form.stock_id),
        quantity: Number(form.quantity),
        average_price: Number(form.average_price),
      });
      setShowAdd(false);
      setForm({ stock_id: '', quantity: '', average_price: '' });
      refresh();
      notify('Position added');
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const syncBrokers = async () => {
    setBusy(true);
    try {
      const r = await api.brokers.syncAll() as any;
      notify(`Synced: ${r.results.map((x: any) => `${x.broker}=${x.count}`).join(', ') || 'no enabled brokers'}`);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const totalInvested = items.reduce((s, i) => s + (i.invested_value ?? 0), 0);
  const totalCurrent = items.reduce((s, i) => s + (i.current_value ?? 0), 0);
  const totalPnL = totalCurrent - totalInvested;
  const totalPnLPct = totalInvested ? (totalPnL / totalInvested) * 100 : 0;

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Portfolio</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Holdings &amp; live performance</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<RefreshCw size={14} />} onClick={syncBrokers} loading={busy}>
            Sync Brokers
          </Button>
          <Button icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>
            Add Position
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Stat label="Total Invested" value={fmtINR(totalInvested)} />
        <Stat label="Current Value" value={fmtINR(totalCurrent)} />
        <Stat label="P&L" value={`${fmtINR(totalPnL)} (${fmtPct(totalPnLPct)})`} positive={totalPnL > 0} negative={totalPnL < 0} />
      </div>

      <Card>
        <PortfolioTable items={items} onRemove={async (id) => { await api.portfolio.remove(id); refresh(); }} />
      </Card>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Position">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Stock">
            <Select value={form.stock_id} onChange={(e) => setForm({ ...form, stock_id: e.target.value })} required>
              <option value="">Select…</option>
              {stocks.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.symbol} — {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity">
            <Input type="number" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
          </Field>
          <Field label="Avg Purchase Price (₹)">
            <Input type="number" step="0.01" value={form.average_price} onChange={(e) => setForm({ ...form, average_price: e.target.value })} required />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={busy} className="flex-1">Save</Button>
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ label, value, positive, negative }: { label: string; value: React.ReactNode; positive?: boolean; negative?: boolean }) {
  const tone = positive ? 'is-positive' : negative ? 'is-negative' : '';
  return (
    <div className={`surface stat-card p-5 sm:p-6 ${tone}`}>
      <div className="col-header mb-2">{label}</div>
      <div className={`text-2xl sm:text-3xl font-display font-black tracking-tighter ${positive ? 'text-emerald-700' : negative ? 'text-rose-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  );
}

function PortfolioTable({ items, onRemove }: { items: any[]; onRemove: (id: number) => void }) {
  const columns: Column<any>[] = [
    {
      key: 'symbol',
      label: 'Symbol',
      sortable: true,
      sortValue: (r) => r.symbol,
      render: (r) => (
        <div>
          <div className="font-bold">{r.symbol}</div>
          <div className="text-[10px] opacity-50">{r.name}</div>
        </div>
      ),
    },
    { key: 'source', label: 'Source', sortable: true, sortValue: (r) => r.source ?? 'manual', render: (r) => <Badge>{r.source ?? 'manual'}</Badge> },
    { key: 'quantity', label: 'Qty', sortable: true, sortValue: (r) => r.quantity, render: (r) => <span className="font-mono">{r.quantity}</span>, align: 'right' },
    { key: 'average_price', label: 'Avg', sortable: true, sortValue: (r) => r.average_price, render: (r) => <span className="font-mono">{fmtINR(r.average_price)}</span>, align: 'right' },
    { key: 'ltp', label: 'LTP', sortable: true, sortValue: (r) => r.ltp, render: (r) => <span className="font-mono">{fmtINR(r.ltp)}</span>, align: 'right' },
    { key: 'invested_value', label: 'Invested', sortable: true, sortValue: (r) => r.invested_value, render: (r) => <span className="font-mono">{fmtINR(r.invested_value)}</span>, align: 'right' },
    { key: 'current_value', label: 'Value', sortable: true, sortValue: (r) => r.current_value, render: (r) => <span className="font-mono">{fmtINR(r.current_value)}</span>, align: 'right' },
    {
      key: 'pnl',
      label: 'P&L',
      sortable: true,
      sortValue: (r) => r.pnl,
      align: 'right',
      render: (r) => (
        <span className={`font-mono font-bold ${r.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {fmtINR(r.pnl)} <span className="text-[10px]">({fmtPct(r.pnl_pct)})</span>
        </span>
      ),
    },
    {
      key: 'pnl_pct',
      label: '%',
      sortable: true,
      sortValue: (r) => r.pnl_pct,
      align: 'right',
      render: (r) => (
        <span className={`font-mono ${r.pnl_pct >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtPct(r.pnl_pct)}</span>
      ),
    },
    {
      key: 'actions',
      label: '',
      render: (r) => (
        <button className="opacity-50 hover:opacity-100 hover:text-rose-700" onClick={() => onRemove(r.id)} aria-label="Remove">
          <Trash2 size={14} />
        </button>
      ),
      align: 'right',
    },
  ];
  return (
    <SortableTable
      data={items}
      columns={columns}
      rowKey={(r) => r.id}
      initialSort={{ key: 'current_value', dir: 'desc' }}
      emptyMessage="No holdings yet. Add manually or connect a broker."
    />
  );
}
