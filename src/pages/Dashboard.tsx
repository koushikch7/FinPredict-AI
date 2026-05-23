import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, Activity, Calendar, CircleDot } from 'lucide-react';
import { api } from '../lib/api';
import { fmtINR, fmtPct } from '../lib/format';
import { Card, Stat, Badge } from '../components/Card';
import { AreaCurve } from '../components/charts/LineCharts';
import { AllocationDonut } from '../components/charts/MiscCharts';

export function DashboardPage() {
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [predictions, setPredictions] = useState<any[]>([]);
  const [accuracy, setAccuracy] = useState<any | null>(null);
  const [market, setMarket] = useState<any | null>(null);

  useEffect(() => {
    Promise.all([
      api.portfolio.list().then(setPortfolio).catch(() => setPortfolio([])),
      api.predictions.list().then(setPredictions).catch(() => setPredictions([])),
      api.predictions.accuracy().then(setAccuracy).catch(() => null),
      api.stocks.marketStatus().then(setMarket).catch(() => null),
    ]).catch(() => {});
  }, []);

  const totalInvested = portfolio.reduce((s, i) => s + (i.invested_value ?? 0), 0);
  const totalCurrent = portfolio.reduce((s, i) => s + (i.current_value ?? 0), 0);
  const pnl = totalCurrent - totalInvested;
  const pnlPct = totalInvested ? (pnl / totalInvested) * 100 : 0;

  const allocation = portfolio.map((p) => ({ name: p.symbol, value: p.current_value ?? p.invested_value }));

  // Build performance data from portfolio (value per holding)
  const topHoldings = [...portfolio]
    .sort((a, b) => (b.current_value ?? 0) - (a.current_value ?? 0))
    .slice(0, 10);

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Dashboard</h1>
          <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Real portfolio &amp; AI intelligence</p>
        </div>
        {market && (
          <div className="flex items-center gap-2">
            <CircleDot size={10} className={market.open ? 'text-emerald-600 animate-pulse' : 'text-rose-500'} />
            <span className="text-[10px] uppercase tracking-widest font-bold">
              NSE {market.open ? 'Open' : market.holiday ? 'Holiday' : 'Closed'}
            </span>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat label="Invested" value={fmtINR(totalInvested)} hint={`${portfolio.length} holdings`} />
        <Stat label="Current Value" value={fmtINR(totalCurrent)} />
        <Stat
          label="Unrealised P&L"
          value={fmtINR(pnl)}
          hint={fmtPct(pnlPct)}
          positive={pnl > 0}
          negative={pnl < 0}
        />
        <Stat
          label="Model Accuracy"
          value={accuracy?.accuracy_pct == null ? '—' : `${accuracy.accuracy_pct.toFixed(1)}%`}
          hint={accuracy ? `${accuracy.total ?? 0} predictions, ${accuracy.pending ?? 0} pending` : 'No data yet'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card title="Portfolio Performance" className="lg:col-span-2">
          {topHoldings.length > 0 ? (
            <div className="space-y-3">
              {topHoldings.map((h) => {
                const hPnl = (h.current_value ?? 0) - (h.invested_value ?? 0);
                const hPct = h.invested_value ? (hPnl / h.invested_value) * 100 : 0;
                return (
                  <div key={h.id} className="flex items-center justify-between text-sm border-b border-[#141414]/5 py-2">
                    <div className="flex items-center gap-3">
                      {hPnl >= 0 ? (
                        <TrendingUp size={14} className="text-emerald-700" />
                      ) : (
                        <TrendingDown size={14} className="text-rose-700" />
                      )}
                      <span className="font-bold">{h.symbol}</span>
                      <span className="text-xs opacity-60">{h.quantity} qty</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono">{fmtINR(h.current_value ?? 0)}</span>
                      <span className={`text-xs font-mono font-bold ${hPnl >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {fmtPct(hPct)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState text="No holdings yet. Connect a broker or add positions from Portfolio →" />
          )}
        </Card>

        <Card title="Allocation">
          {allocation.length > 0 ? (
            <AllocationDonut data={allocation} />
          ) : (
            <EmptyState text="Connect a broker or add manual holdings" />
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Recent Predictions" action={<Link to="/predictions" className="text-[10px] uppercase tracking-widest font-bold hover:underline">View all →</Link>}>
          {predictions.length === 0 ? (
            <EmptyState text="No predictions yet. Generate one from Predictions →" />
          ) : (
            <div className="space-y-3">
              {predictions.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between text-sm border-b border-[#141414]/5 py-2">
                  <div className="flex items-center gap-3">
                    {p.direction === 'UP' ? (
                      <TrendingUp size={14} className="text-emerald-700" />
                    ) : p.direction === 'DOWN' ? (
                      <TrendingDown size={14} className="text-rose-700" />
                    ) : (
                      <Activity size={14} className="text-amber-700" />
                    )}
                    <span className="font-bold">{p.symbol}</span>
                    <Badge>{p.horizon}</Badge>
                    <span className="text-xs opacity-60">{p.strategy}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono">{fmtPct(p.expected_move_p)}</span>
                    <Badge variant={p.result === 'ACCURATE' ? 'success' : p.result === 'FAILED' ? 'danger' : 'neutral'}>
                      {p.status === 'PENDING' ? 'pending' : p.result?.toLowerCase()}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Market Holidays" action={<span className="text-[10px] uppercase tracking-widest opacity-50">NSE Calendar</span>}>
          {market?.upcomingHolidays?.length > 0 ? (
            <div className="space-y-3">
              {market.upcomingHolidays.map((h: any) => (
                <div key={h.date} className="flex items-center justify-between text-sm border-b border-[#141414]/5 py-2">
                  <div className="flex items-center gap-3">
                    <Calendar size={14} className="text-amber-600" />
                    <span className="font-bold">{h.name}</span>
                  </div>
                  <span className="text-xs font-mono opacity-60">{h.date}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No upcoming holidays" />
          )}
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-xs text-[#141414]/50 italic py-6 text-center uppercase tracking-widest">{text}</div>
  );
}
