import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine } from 'recharts';
import { fmtINR, fmtDate } from '../../lib/format';

interface Point {
  t: string | number;
  value: number;
}

export function LineSpark({ data, color = '#10B981' }: { data: Point[]; color?: string }) {
  return (
    <ResponsiveContainer width="100%" height={50}>
      <LineChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaCurve({
  data,
  yLabel = 'Value',
  height = 280,
  baseline,
}: {
  data: Point[];
  yLabel?: string;
  height?: number;
  /** Reference value used to colour the curve green (above) / red (below). Defaults to first data point. */
  baseline?: number;
}) {
  // Auto-zoom Y axis: pad the visible range by 5% so small movements are visible.
  const values = data.map((d) => d.value).filter((v) => Number.isFinite(v));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const pad = Math.max((max - min) * 0.05, max * 0.005, 1);
  const yMin = Math.max(0, min - pad);
  const yMax = max + pad;
  const base = baseline ?? values[0] ?? 0;

  // Position of the baseline within the visible Y range, 0..1 from top.
  const basePos = yMax === yMin ? 0.5 : Math.max(0, Math.min(1, (yMax - base) / (yMax - yMin)));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
        <defs>
          <linearGradient id="curveFillSplit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.45} />
            <stop offset={`${basePos * 100}%`} stopColor="#10B981" stopOpacity={0.05} />
            <stop offset={`${basePos * 100}%`} stopColor="#E11D48" stopOpacity={0.05} />
            <stop offset="100%" stopColor="#E11D48" stopOpacity={0.45} />
          </linearGradient>
          <linearGradient id="curveStrokeSplit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset={`${basePos * 100}%`} stopColor="#10B981" />
            <stop offset={`${basePos * 100}%`} stopColor="#E11D48" />
            <stop offset="100%" stopColor="#E11D48" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#14141420" />
        <XAxis
          dataKey="t"
          tickFormatter={(t) => fmtDate(t).split(',')[0]}
          tick={{ fontSize: 10, fill: '#141414' }}
          stroke="#141414"
          minTickGap={40}
        />
        <YAxis
          domain={[yMin, yMax]}
          tickFormatter={(v) => fmtINR(v, { decimals: 0 })}
          tick={{ fontSize: 10, fill: '#141414' }}
          stroke="#141414"
          width={80}
        />
        <Tooltip
          formatter={(v: any) => [fmtINR(v as number), yLabel]}
          labelFormatter={(t) => fmtDate(t as string)}
          contentStyle={{ background: '#F8F7F4', border: '1px solid #141414', fontSize: 12 }}
        />
        <ReferenceLine y={base} stroke="#141414" strokeDasharray="4 4" strokeOpacity={0.5} ifOverflow="extendDomain" label={{ value: 'Start', fontSize: 10, fill: '#141414', position: 'right' }} />
        {/* Single shaded area below the curve, gradient flips colour at the baseline. */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="url(#curveStrokeSplit)"
          strokeWidth={2}
          fill="url(#curveFillSplit)"
          baseValue={base as any}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
