import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Card } from '../components/Card';

export function NewsPage() {
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => { api.news.list().then(setItems).catch(() => setItems([])); }, []);
  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">News</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Indian markets &amp; macro headlines</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.length === 0 ? (
          <Card><div className="opacity-50 text-sm text-center py-8">Fetching news…</div></Card>
        ) : items.map((n: any, i: number) => (
          <a
            key={i}
            href={n.url}
            target="_blank"
            rel="noreferrer"
            className="bg-white border border-[#141414]/10 p-5 hover:bg-[#141414]/5 transition-colors block"
          >
            <div className="flex items-start gap-2">
              <h3 className="font-display font-bold flex-1 leading-snug">{n.headline}</h3>
              <ExternalLink size={14} className="opacity-50 flex-shrink-0 mt-1" />
            </div>
            {n.summary && <p className="text-xs opacity-70 mt-2 line-clamp-3">{n.summary}</p>}
            <div className="flex justify-between mt-3 text-[10px] uppercase tracking-widest opacity-50">
              <span>{n.source}</span>
              <span>{fmtDate(n.published_at)}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
