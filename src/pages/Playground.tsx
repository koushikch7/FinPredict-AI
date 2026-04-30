import { useEffect, useState } from 'react';
import { Sparkles, RotateCcw, ShoppingCart, MinusCircle } from 'lucide-react';
import { api } from '../lib/api';
import { fmtINR, fmtPct, fmtDateTimeIST } from '../lib/format';
import { Card, Badge, Stat } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Field, Input, Select, Textarea } from '../components/Field';
import { AreaCurve } from '../components/charts/LineCharts';
import { SortableTable, type Column } from '../components/SortableTable';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { useToast } from '../lib/toast';

const STRATEGIES = ['Buffett', 'Lynch', 'Graham', 'Momentum', 'MeanReversion', 'Balanced'];
const RISKS = ['Conservative', 'Moderate', 'Aggressive'];
const HORIZONS = ['Intraday', 'Short-term', 'Long-term'] as const;
const STRATEGY_TAGS = ['momentum', 'mean-reversion', 'breakout', 'value', 'swing', 'defensive', 'news-driven', 'hedge', 'manual'];

// Friendly long-form tooltips (shown on hover via the `?` icon next to each field label).
const TOOLTIPS = {
  autoTrade: 'When ON, the AI trader runs on the cron schedule and can place real paper trades. When OFF, you can still trigger Run AI Cycle manually.',
  strategy: 'High-level investing playbook the AI uses as its bias. Buffett=quality + moat, Lynch=growth at reasonable price, Graham=deep value, Momentum=trend-following, MeanReversion=fade extremes, Balanced=blend.',
  risk: 'Risk preset that controls position size, stop-loss, take-profit and daily kill-switch defaults. Conservative is tightest, Aggressive is loosest.',
  universe: 'Set of stocks the AI is allowed to trade. Auto mode merges Discovery picks + your watchlist + current holdings. Add custom symbols in settings to override.',
  maxPos: 'Maximum % of total equity that any single stock can occupy. Caps concentration risk.',
  stopLoss: 'AI auto-sells a position when its unrealised loss vs entry exceeds this %. Lower = tighter risk.',
  takeProfit: 'AI auto-sells a position when its unrealised gain vs entry exceeds this %. Higher = let winners run longer.',
  killSwitch: 'If the account drops by this % in a single day vs yesterday’s close, the AI is paused for the rest of the day. Protects against runaway losses.',
  manualSymbol: 'Stock to trade. Live LTP is fetched from Yahoo when you select.',
  manualSide: 'BUY adds to position (uses cash). SELL reduces position (returns cash). Cannot SELL more than you hold or BUY more than your cash allows.',
  manualQty: 'Number of shares. The Max Affordable hint shows how many you can buy with current cash at LTP after 0.1% fees.',
  manualHorizon: 'How long you intend to hold this trade. Used for performance attribution — the system tracks which horizons make money for you.',
  manualReason: 'Why are you taking this trade? Stored with the trade and used by future AI cycles to learn from your manual decisions.',
  manualStrategy: 'Strategy bucket for this trade so the Strategy Performance card can attribute realised P&L back to the playbook that produced it.',
  resetCap: 'Wipes all positions, trades and equity history, then re-funds the paper account with this amount in virtual cash.',
};

export function PlaygroundPage() {
  const { notify } = useToast();
  const [data, setData] = useState<any>(null);
  const [trades, setTrades] = useState<any[]>([]);
  const [equity, setEquity] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [resetCap, setResetCap] = useState('100000');
  const [tradeForm, setTradeForm] = useState({
    symbol: '',
    side: 'BUY' as 'BUY' | 'SELL',
    quantity: '',
    horizon: 'Short-term' as (typeof HORIZONS)[number],
    reason: '',
    strategy_tag: 'manual',
  });
  const [stocks, setStocks] = useState<any[]>([]);
  const [tradeQuote, setTradeQuote] = useState<{ symbol: string; price: number } | null>(null);
  const [strategyStats, setStrategyStats] = useState<any[]>([]);

  const refresh = () => {
    api.playground.get().then(setData).catch(() => setData(null));
    api.playground.trades().then(setTrades).catch(() => setTrades([]));
    api.playground.equityCurve().then(setEquity).catch(() => setEquity([]));
    api.playground.strategyStats().then((r: any) => setStrategyStats(Array.isArray(r) ? r : [])).catch(() => setStrategyStats([]));
  };
  useEffect(() => {
    refresh();
    api.stocks.list().then(setStocks).catch(() => setStocks([]));
  }, []);
  // Live polling – every 30s, paused when tab is hidden
  useAutoRefresh(() => {
    api.playground.get().then(setData).catch(() => {});
    api.playground.trades().then(setTrades).catch(() => {});
  }, 30_000);

  // When the user picks a symbol in the trade modal, fetch its LTP so we can
  // show price + max-affordable hint and disable BUY beyond available cash.
  useEffect(() => {
    if (!tradeOpen || !tradeForm.symbol) {
      setTradeQuote(null);
      return;
    }
    let cancelled = false;
    api.playground.quote(tradeForm.symbol)
      .then((q: any) => { if (!cancelled) setTradeQuote({ symbol: q.symbol, price: q.price }); })
      .catch(() => { if (!cancelled) setTradeQuote(null); });
    return () => { cancelled = true; };
  }, [tradeOpen, tradeForm.symbol]);

  const updateSettings = async (patch: any) => {
    setBusy(true);
    try {
      await api.playground.settings(patch);
      notify('Settings updated');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const runAI = async () => {
    setBusy(true);
    try {
      const r = await api.playground.runAI() as any;
      const fc = r.forced_closes?.length ? ` • ${r.forced_closes.length} risk-close` : '';
      const paused = r.paused ? ' • PAUSED' : '';
      const errSuffix = r.errors?.length ? ` • ${r.errors[0]}${r.errors.length > 1 ? ` (+${r.errors.length - 1} more)` : ''}` : '';
      const tone: 'success' | 'error' | 'info' =
        r.paused || r.skipped ? 'error' : r.executed ? 'success' : 'info';
      notify(`AI executed ${r.executed} trades${fc}${paused}${errSuffix}`, tone);
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const submitTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.playground.trade({
        symbol: tradeForm.symbol.toUpperCase(),
        side: tradeForm.side,
        quantity: Number(tradeForm.quantity),
        horizon: tradeForm.horizon,
        reason: tradeForm.reason || undefined,
        strategy_tag: tradeForm.strategy_tag || undefined,
      });
      setTradeOpen(false);
      notify('Trade executed');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.playground.reset(Number(resetCap));
      setResetOpen(false);
      notify('Account reset');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  if (!data) return <div className="p-6">Loading…</div>;

  const equityPoints = equity.map((e: any) => ({ t: e.timestamp, value: e.total }));
  // Baseline = starting capital; chart paints green above, red below.
  const equityBaseline = data.account?.starting_capital ?? equityPoints[0]?.value;

  // Manual-trade math
  const ltp = tradeQuote?.price ?? 0;
  const qtyNum = Number(tradeForm.quantity) || 0;
  const grossEst = ltp * qtyNum;
  const feeEst = grossEst * 0.001;
  const netEst = tradeForm.side === 'BUY' ? grossEst + feeEst : grossEst - feeEst;
  const maxAffordableQty = ltp > 0 ? Math.floor((data.cash * 0.999) / ltp) : 0;
  const heldQty = (data.positions ?? []).find((p: any) => p.symbol === tradeForm.symbol)?.quantity ?? 0;
  const insufficientCash = tradeForm.side === 'BUY' && netEst > data.cash;
  const insufficientShares = tradeForm.side === 'SELL' && qtyNum > heldQty;
  const tradeBlocked = !tradeForm.symbol || qtyNum <= 0 || insufficientCash || insufficientShares;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Playground</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">
            AI-managed paper-trading with virtual ₹ credits • {data.market_open ? <Badge variant="success">NSE Open</Badge> : <Badge variant="warning">Closed</Badge>} • <span title="All timestamps shown in Indian Standard Time (UTC+05:30)">Times in IST</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<RotateCcw size={14} />} onClick={() => setResetOpen(true)}>Reset</Button>
          <Button variant="secondary" icon={<ShoppingCart size={14} />} onClick={() => setTradeOpen(true)}>Manual Trade</Button>
          <Button icon={<Sparkles size={14} />} loading={busy} onClick={runAI}>Run AI Cycle</Button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Cash" value={fmtINR(data.cash)} />
        <Stat label="Equity" value={fmtINR(data.equity)} />
        <Stat label="Total" value={fmtINR(data.total)} />
        <Stat label="Return" value={fmtPct(data.pnl_pct)} positive={data.pnl_pct > 0} negative={data.pnl_pct < 0} />
      </div>

      {data.ai_status && (
        <Card title="AI Trader Status">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Auto-trade</div>
              {data.ai_status.auto_trade
                ? <Badge variant="success">ON</Badge>
                : <Badge variant="warning">OFF</Badge>}
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Cron</div>
              <code className="font-mono text-[11px]">{data.ai_status.cron}</code>
              <div className="opacity-50 text-[10px] mt-0.5">NSE hours only</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">AI engine</div>
              <div className="font-mono text-[11px] font-bold">
                {data.ai_status.provider ?? '—'}
                <span className="opacity-50">/{data.ai_status.model ?? ''}</span>
              </div>
              <div className="opacity-50 text-[10px] mt-0.5">source: {data.ai_status.provider_source ?? '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">AI trades today</div>
              <div className="font-mono text-lg font-bold">{data.ai_status.ai_trades_today}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest opacity-60 mb-1">Last AI trade</div>
              {data.ai_status.last_ai_trade ? (
                <div>
                  <div className="font-bold">{data.ai_status.last_ai_trade.side} {data.ai_status.last_ai_trade.quantity} {data.ai_status.last_ai_trade.symbol}</div>
                  <div className="opacity-60 text-[10px]">{fmtDateTimeIST(data.ai_status.last_ai_trade.executed_at)}</div>
                </div>
              ) : <span className="opacity-50">—</span>}
            </div>
          </div>
          {/* Daily-loss kill-switch gauge */}
          {data.ai_status.daily_dd_pct != null && (
            <div className="mt-4 pt-4 border-t border-[#141414]/10">
              <div className="flex justify-between text-[10px] uppercase tracking-widest opacity-60 mb-1">
                <span>Daily P&amp;L vs kill-switch</span>
                <span className="font-mono">
                  {data.ai_status.daily_dd_pct.toFixed(2)}% / {data.ai_status.daily_dd_threshold?.toFixed(2)}%
                </span>
              </div>
              <div className="h-2 bg-[#141414]/10 relative">
                {(() => {
                  const dd = data.ai_status.daily_dd_pct as number;
                  const thr = -Math.abs(data.ai_status.daily_dd_threshold as number);
                  // Position 0 in middle; left = loss, right = gain.
                  const ratio = Math.max(-1, Math.min(1, dd / Math.abs(thr)));
                  const widthPct = Math.abs(ratio) * 50;
                  const tone = dd >= 0 ? 'bg-emerald-500' : Math.abs(ratio) > 0.66 ? 'bg-rose-600' : 'bg-amber-500';
                  return (
                    <>
                      <div className="absolute top-0 bottom-0 w-px bg-[#141414]/40" style={{ left: '50%' }} />
                      <div
                        className={`absolute top-0 bottom-0 ${tone}`}
                        style={{
                          left: dd >= 0 ? '50%' : `${50 - widthPct}%`,
                          width: `${widthPct}%`,
                        }}
                      />
                    </>
                  );
                })()}
              </div>
            </div>
          )}
          {!data.market_open && data.ai_status.auto_trade && (
            <div className="mt-3 pt-3 border-t border-[#141414]/10 text-[11px] opacity-70">
              ⓘ NSE is closed. The auto-trader will resume on the next weekday at 09:15 IST.
            </div>
          )}
          {data.market_open && data.ai_status.auto_trade && data.ai_status.ai_trades_today === 0 && (
            <div className="mt-3 pt-3 border-t border-[#141414]/10 text-[11px] opacity-70">
              ⓘ Auto-trade is ON but no AI trades yet today. The cron runs every few minutes; HOLD decisions are normal when signals are weak. Use <strong>Run AI Cycle</strong> to force one now.
            </div>
          )}
        </Card>
      )}

      <Card title="AI Trading Settings">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Field label="Auto-trade" tooltip={TOOLTIPS.autoTrade}>
            <Select
              value={data.account.auto_trade ? 'on' : 'off'}
              onChange={(e) => updateSettings({ auto_trade: e.target.value === 'on' })}
            >
              <option value="off">OFF</option>
              <option value="on">ON</option>
            </Select>
          </Field>
          <Field label="Strategy" tooltip={TOOLTIPS.strategy}>
            <Select value={data.account.strategy} onChange={(e) => updateSettings({ strategy: e.target.value })}>
              {STRATEGIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Risk Level" tooltip={TOOLTIPS.risk}>
            <Select value={data.account.risk_level} onChange={(e) => updateSettings({ risk_level: e.target.value })}>
              {RISKS.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Universe" tooltip={TOOLTIPS.universe}>
            <div className="text-xs font-mono opacity-70 p-2 border border-[#141414] bg-[#F8F7F4] truncate"
                 title={(data.effective_universe ?? []).join(', ')}>
              {(data.effective_universe ?? []).slice(0, 10).join(', ')}
              {(data.effective_universe ?? []).length > 10 && ` +${data.effective_universe.length - 10} more`}
              {data.universe_mode === 'auto' && <span className="ml-2 opacity-60">(auto: Discovery ∪ watchlist ∪ holdings)</span>}
            </div>
          </Field>
        </div>
        <div className="mt-4 pt-4 border-t border-[#141414]/10">
          <div className="text-[10px] uppercase tracking-widest text-[#141414]/60 mb-3">
            Risk Controls — applied automatically before each AI cycle
            {data.account.paused_until && new Date(data.account.paused_until) > new Date() && (
              <span className="ml-3"><Badge variant="danger">PAUSED until {fmtDateTimeIST(data.account.paused_until)}</Badge></span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Max Position %" tooltip={TOOLTIPS.maxPos}>
              <Input
                type="number" min={1} max={100} step={1}
                defaultValue={data.account.max_position_pct ?? 20}
                onBlur={(e) => updateSettings({ max_position_pct: Number(e.target.value) })}
              />
            </Field>
            <Field label="Stop-Loss %" tooltip={TOOLTIPS.stopLoss}>
              <Input
                type="number" min={0.5} max={50} step={0.5}
                defaultValue={data.account.stop_loss_pct ?? 8}
                onBlur={(e) => updateSettings({ stop_loss_pct: Number(e.target.value) })}
              />
            </Field>
            <Field label="Take-Profit %" tooltip={TOOLTIPS.takeProfit}>
              <Input
                type="number" min={1} max={200} step={1}
                defaultValue={data.account.take_profit_pct ?? 25}
                onBlur={(e) => updateSettings({ take_profit_pct: Number(e.target.value) })}
              />
            </Field>
            <Field label="Daily Loss Kill-Switch %" tooltip={TOOLTIPS.killSwitch}>
              <Input
                type="number" min={0.5} max={50} step={0.5}
                defaultValue={data.account.max_daily_loss_pct ?? 5}
                onBlur={(e) => updateSettings({ max_daily_loss_pct: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Equity Curve" subtitle="Green = above starting capital, Red = below">
        {equityPoints.length > 1 ? (
          <AreaCurve data={equityPoints} yLabel="Total" baseline={equityBaseline} />
        ) : (
          <div className="text-center py-12 text-sm opacity-50">No history yet — run the AI or place a trade.</div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Open Positions">
          <PositionsTable positions={data.positions} />
        </Card>

        <Card title="Trade Tape" subtitle="Last 100 trades — hover the AI badge / row for context">
          <TradesTable trades={trades} />
        </Card>
      </div>

      <Card title="Strategy Performance" subtitle="Closed-trade attribution — the AI uses this as feedback to bias toward winning playbooks">
        <StrategyStatsTable rows={strategyStats} />
      </Card>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset Account">
        <form onSubmit={submitReset} className="space-y-4">
          <p className="text-xs opacity-70">This wipes all positions, trades and history, then re-funds the account.</p>
          <Field label="Starting Capital (₹)" tooltip={TOOLTIPS.resetCap}>
            <Input type="number" min={1000} value={resetCap} onChange={(e) => setResetCap(e.target.value)} required />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button type="submit" variant="danger" className="flex-1">Reset</Button>
            <Button type="button" variant="secondary" onClick={() => setResetOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>

      <Modal open={tradeOpen} onClose={() => setTradeOpen(false)} title="Manual Trade">
        <form onSubmit={submitTrade} className="space-y-4">
          {/* Account snapshot at the top of the modal so the user always sees what they can spend. */}
          <div className="grid grid-cols-3 gap-2 text-xs p-3 bg-[#F8F7F4] border border-[#141414]/10 rounded">
            <div>
              <div className="opacity-60 text-[10px] uppercase tracking-widest">Cash</div>
              <div className="font-mono font-bold">{fmtINR(data.cash)}</div>
            </div>
            <div>
              <div className="opacity-60 text-[10px] uppercase tracking-widest">LTP</div>
              <div className="font-mono font-bold">{ltp ? fmtINR(ltp) : '—'}</div>
            </div>
            <div>
              <div className="opacity-60 text-[10px] uppercase tracking-widest">Held qty</div>
              <div className="font-mono font-bold">{heldQty}</div>
            </div>
          </div>

          <Field label="Symbol" tooltip={TOOLTIPS.manualSymbol}>
            <Select value={tradeForm.symbol} onChange={(e) => setTradeForm({ ...tradeForm, symbol: e.target.value })} required>
              <option value="">Select…</option>
              {stocks.map((s: any) => <option key={s.id} value={s.symbol}>{s.symbol}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Side" tooltip={TOOLTIPS.manualSide}>
              <Select value={tradeForm.side} onChange={(e) => setTradeForm({ ...tradeForm, side: e.target.value as 'BUY' | 'SELL' })}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </Select>
            </Field>
            <Field label="Horizon" tooltip={TOOLTIPS.manualHorizon}>
              <Select value={tradeForm.horizon} onChange={(e) => setTradeForm({ ...tradeForm, horizon: e.target.value as (typeof HORIZONS)[number] })}>
                {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            </Field>
          </div>
          <Field
            label="Quantity"
            tooltip={TOOLTIPS.manualQty}
            hint={
              tradeForm.side === 'BUY'
                ? `Max affordable at LTP: ${maxAffordableQty} shares`
                : `You hold ${heldQty} shares`
            }
          >
            <Input
              type="number" min={1}
              max={tradeForm.side === 'BUY' ? maxAffordableQty || undefined : heldQty || undefined}
              value={tradeForm.quantity}
              onChange={(e) => setTradeForm({ ...tradeForm, quantity: e.target.value })}
              required
            />
          </Field>

          {/* Live cost / proceeds preview */}
          {ltp > 0 && qtyNum > 0 && (
            <div className="text-[11px] font-mono p-2 bg-white border border-[#141414]/10 rounded">
              <div className="flex justify-between"><span className="opacity-60">Gross</span><span>{fmtINR(grossEst)}</span></div>
              <div className="flex justify-between"><span className="opacity-60">Fees (0.1%)</span><span>{fmtINR(feeEst)}</span></div>
              <div className="flex justify-between font-bold border-t border-[#141414]/10 mt-1 pt-1">
                <span>{tradeForm.side === 'BUY' ? 'Cash needed' : 'Cash received'}</span>
                <span>{fmtINR(netEst)}</span>
              </div>
              {tradeForm.side === 'BUY' && (
                <div className="flex justify-between mt-1">
                  <span className="opacity-60">Cash after trade</span>
                  <span className={insufficientCash ? 'text-rose-700 font-bold' : ''}>
                    {fmtINR(data.cash - netEst)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Strategy tag" tooltip={TOOLTIPS.manualStrategy}>
              <Select value={tradeForm.strategy_tag} onChange={(e) => setTradeForm({ ...tradeForm, strategy_tag: e.target.value })}>
                {STRATEGY_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <div /> {/* spacer */}
          </div>
          <Field label="Reason / thesis" tooltip={TOOLTIPS.manualReason} hint="Optional, max 500 chars. Stored with the trade and shown in the trade-tape tooltip.">
            <Textarea
              rows={2}
              maxLength={500}
              value={tradeForm.reason}
              onChange={(e) => setTradeForm({ ...tradeForm, reason: e.target.value })}
              placeholder="e.g. Breakout above 200-day SMA on volume; news of order win."
            />
          </Field>

          {(insufficientCash || insufficientShares) && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
              {insufficientCash && `Insufficient cash. You have ${fmtINR(data.cash)}, need ${fmtINR(netEst)}.`}
              {insufficientShares && `You only hold ${heldQty} shares.`}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={tradeBlocked}>Execute at LTP</Button>
            <Button type="button" variant="secondary" onClick={() => setTradeOpen(false)}>Cancel</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function PositionsTable({ positions }: { positions: any[] }) {
  const cols: Column<any>[] = [
    { key: 'symbol', label: 'Symbol', sortable: true, sortValue: (r) => r.symbol, render: (r) => <span className="font-bold">{r.symbol}</span> },
    { key: 'quantity', label: 'Qty', sortable: true, sortValue: (r) => r.quantity, align: 'right', render: (r) => <span className="font-mono">{r.quantity}</span> },
    { key: 'average_price', label: 'Avg', sortable: true, sortValue: (r) => r.average_price, align: 'right', render: (r) => <span className="font-mono">{fmtINR(r.average_price)}</span> },
    { key: 'ltp', label: 'LTP', sortable: true, sortValue: (r) => r.ltp, align: 'right', render: (r) => <span className="font-mono">{fmtINR(r.ltp)}</span> },
    { key: 'value', label: 'Value', sortable: true, sortValue: (r) => r.value, align: 'right', render: (r) => <span className="font-mono">{fmtINR(r.value)}</span> },
    {
      key: 'pnl', label: 'P&L', sortable: true, sortValue: (r) => r.pnl, align: 'right',
      render: (r) => (
        <span className={`font-mono font-bold ${r.pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
          {fmtINR(r.pnl)} <span className="text-[10px]">({fmtPct(r.pnl_pct)})</span>
        </span>
      ),
    },
  ];
  return <SortableTable data={positions} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'value', dir: 'desc' }} emptyMessage="No positions." pageSize={10} />;
}

function TradesTable({ trades }: { trades: any[] }) {
  // Build a multi-line tooltip for the whole row (rendered on the Symbol cell).
  const buildRowTip = (r: any): string => {
    const parts: string[] = [];
    parts.push(`${r.side} ${r.quantity} ${r.symbol} @ ${fmtINR(r.price)}`);
    if (r.horizon) parts.push(`Horizon: ${r.horizon}`);
    if (r.strategy_tag) parts.push(`Strategy: ${r.strategy_tag}`);
    if (r.market_regime) parts.push(`Regime at trade: ${r.market_regime}`);
    if (r.realized_pnl != null) parts.push(`Realised P&L: ${fmtINR(r.realized_pnl)}`);
    if (r.ai_decision) {
      const ai = `${r.ai_provider ?? '?'}/${r.ai_model ?? '?'}${
        r.ai_upstream_model && r.ai_upstream_model !== r.ai_model ? ` → ${r.ai_upstream_model}` : ''
      }${r.ai_latency_ms ? ` • ${r.ai_latency_ms}ms` : ''}`;
      parts.push(`AI: ${ai}`);
    } else {
      parts.push('Source: manual');
    }
    if (r.reason) parts.push(`\nReason: ${r.reason}`);
    return parts.join('\n');
  };

  const cols: Column<any>[] = [
    {
      key: 'side', label: 'Side', sortable: true, sortValue: (r) => r.side,
      render: (r) => {
        const aiTip = r.ai_decision
          ? `${r.ai_provider ?? '?'}/${r.ai_model ?? '?'}${
              r.ai_upstream_model && r.ai_upstream_model !== r.ai_model ? ` → ${r.ai_upstream_model}` : ''
            }${r.ai_latency_ms ? ` • ${r.ai_latency_ms}ms` : ''}${r.reason ? `\n\n${r.reason}` : ''}`
          : '';
        return (
          <div className="flex items-center gap-1">
            {r.side === 'BUY'
              ? <ShoppingCart size={12} className="text-emerald-700" />
              : <MinusCircle size={12} className="text-rose-700" />}
            <Badge variant={r.side === 'BUY' ? 'success' : 'danger'}>{r.side}</Badge>
            {r.ai_decision ? <span title={aiTip}><Badge variant="info">AI</Badge></span> : null}
          </div>
        );
      },
    },
    {
      key: 'symbol', label: 'Symbol', sortable: true, sortValue: (r) => r.symbol,
      render: (r) => (
        <span className="font-bold cursor-help underline decoration-dotted" title={buildRowTip(r)}>
          {r.symbol}
        </span>
      ),
    },
    {
      key: 'horizon', label: 'Horizon', sortable: true, sortValue: (r) => r.horizon ?? '',
      render: (r) => r.horizon
        ? <Badge variant={r.horizon === 'Intraday' ? 'warning' : r.horizon === 'Long-term' ? 'success' : 'info'}>{r.horizon}</Badge>
        : <span className="opacity-30 text-[10px]">—</span>,
    },
    {
      key: 'strategy_tag', label: 'Strategy', sortable: true, sortValue: (r) => r.strategy_tag ?? '',
      render: (r) => r.strategy_tag
        ? <span className="text-[10px] font-mono opacity-70">{r.strategy_tag}</span>
        : <span className="opacity-30 text-[10px]">—</span>,
    },
    { key: 'quantity', label: 'Qty', sortable: true, sortValue: (r) => r.quantity, align: 'right', render: (r) => <span className="font-mono">{r.quantity}</span> },
    { key: 'price', label: 'Price', sortable: true, sortValue: (r) => r.price, align: 'right', render: (r) => <span className="font-mono">{fmtINR(r.price)}</span> },
    {
      key: 'realized_pnl', label: 'Realised P&L', sortable: true, sortValue: (r) => r.realized_pnl ?? 0, align: 'right',
      render: (r) => r.realized_pnl == null
        ? <span className="opacity-30 text-[10px]">—</span>
        : <span className={`font-mono font-bold ${r.realized_pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(r.realized_pnl)}</span>,
    },
    {
      key: 'executed_at', label: 'When', sortable: true, sortValue: (r) => r.executed_at,
      render: (r) => <span className="opacity-60 text-[10px]">{fmtDateTimeIST(r.executed_at)}</span>,
    },
  ];
  return <SortableTable data={trades} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'executed_at', dir: 'desc' }} emptyMessage="No trades yet." pageSize={10} />;
}

function StrategyStatsTable({ rows }: { rows: any[] }) {
  const cols: Column<any>[] = [
    { key: 'strategy_tag', label: 'Strategy', sortable: true, sortValue: (r) => r.strategy_tag, render: (r) => <span className="font-mono text-[11px] font-bold">{r.strategy_tag}</span> },
    { key: 'horizon', label: 'Horizon', sortable: true, sortValue: (r) => r.horizon, render: (r) => <Badge variant="info">{r.horizon}</Badge> },
    { key: 'trades', label: 'Trades', sortable: true, sortValue: (r) => r.trades, align: 'right', render: (r) => <span className="font-mono">{r.trades}</span> },
    {
      key: 'win_rate_pct', label: 'Win-rate', sortable: true, sortValue: (r) => r.win_rate_pct, align: 'right',
      render: (r) => (
        <span className={`font-mono font-bold ${r.win_rate_pct >= 60 ? 'text-emerald-700' : r.win_rate_pct >= 40 ? 'text-amber-700' : 'text-rose-700'}`}>
          {r.win_rate_pct}%
        </span>
      ),
    },
    { key: 'wins', label: 'W', align: 'right', render: (r) => <span className="font-mono text-emerald-700">{r.wins}</span> },
    { key: 'losses', label: 'L', align: 'right', render: (r) => <span className="font-mono text-rose-700">{r.losses}</span> },
    { key: 'avg_pnl', label: 'Avg P&L', sortable: true, sortValue: (r) => r.avg_pnl, align: 'right', render: (r) => <span className={`font-mono ${r.avg_pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(r.avg_pnl)}</span> },
    {
      key: 'total_pnl', label: 'Total P&L', sortable: true, sortValue: (r) => r.total_pnl, align: 'right',
      render: (r) => <span className={`font-mono font-bold ${r.total_pnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtINR(r.total_pnl)}</span>,
    },
  ];
  return (
    <SortableTable
      data={rows}
      columns={cols}
      rowKey={(r) => `${r.strategy_tag}-${r.horizon}`}
      initialSort={{ key: 'total_pnl', dir: 'desc' }}
      emptyMessage="No closed trades yet — strategy attribution will appear after the first SELL."
      pageSize={10}
    />
  );
}
