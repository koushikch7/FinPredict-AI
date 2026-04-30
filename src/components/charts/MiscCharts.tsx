import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { fmtINR } from '../../lib/format';

const COLORS = ['#10B981', '#0EA5E9', '#F59E0B', '#EF4444', '#A855F7', '#84CC16', '#EC4899', '#22D3EE'];

export function AllocationDonut({ data }: { data: Array<{ name: string; value: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: any) => fmtINR(v as number)} contentStyle={{ background: '#F8F7F4', border: '1px solid #141414', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BarSeries({ data, dataKey = 'value' }: { data: Array<Record<string, any>>; dataKey?: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#14141420" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#141414' }} stroke="#141414" />
        <YAxis tick={{ fontSize: 10, fill: '#141414' }} stroke="#141414" />
        <Tooltip contentStyle={{ background: '#F8F7F4', border: '1px solid #141414', fontSize: 12 }} />
        <Bar dataKey={dataKey} fill="#141414" />
      </BarChart>
    </ResponsiveContainer>
  );
}
