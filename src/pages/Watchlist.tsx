import { useEffect, useState } from 'react';
import { Plus, Star, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { fmtINR, fmtPct } from '../lib/format';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Field, Select, Textarea } from '../components/Field';
import { useToast } from '../lib/toast';

export function WatchlistPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [stocks, setStocks] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ stock_id: '', note: '' });

  const refresh = () => {
    api.watchlist.list().then(setItems).catch(() => setItems([]));
    api.stocks.list().then(setStocks).catch(() => setStocks([]));
  };
  useEffect(() => { refresh(); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.watchlist.add({ stock_id: Number(form.stock_id), note: form.note });
      setOpen(false);
      setForm({ stock_id: '', note: '' });
      refresh();
      notify('Added to watchlist');
    } catch (e: any) { notify(e.message, 'error'); }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Watchlist</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Track stocks &amp; ideas</p>
        </div>
        <Button icon={<Plus size={14} />} onClick={() => setOpen(true)}>Add</Button>
      </header>

      {items.length === 0 ? (
        <Card><div className="text-center py-12 text-sm opacity-50">Your watchlist is empty.</div></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((i) => (
            <div key={i.id} className="bg-white border border-[#141414]/10 p-5 flex flex-col gap-3">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-2xl font-display font-black tracking-tight flex items-center gap-2">
                    <Star size={16} className="text-amber-500" /> {i.symbol}
                  </div>
                  <div className="text-[10px] uppercase tracking-widest opacity-50">{i.name}</div>
                </div>
                <button onClick={async () => { await api.watchlist.remove(i.id); refresh(); }} className="opacity-50 hover:opacity-100 hover:text-rose-700">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex justify-between text-sm">
                <span className="font-mono">{i.ltp != null ? fmtINR(i.ltp) : '—'}</span>
                <span className={`font-mono font-bold ${i.changePct > 0 ? 'text-emerald-700' : i.changePct < 0 ? 'text-rose-700' : ''}`}>
                  {fmtPct(i.changePct)}
                </span>
              </div>
              {i.note && <p className="text-xs text-[#141414]/60 italic border-t border-[#141414]/5 pt-2">"{i.note}"</p>}
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add to Watchlist">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Stock">
            <Select value={form.stock_id} onChange={(e) => setForm({ ...form, stock_id: e.target.value })} required>
              <option value="">Select…</option>
              {stocks.map((s: any) => <option key={s.id} value={s.id}>{s.symbol} — {s.name}</option>)}
            </Select>
          </Field>
          <Field label="Note (optional)">
            <Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1">Save</Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
