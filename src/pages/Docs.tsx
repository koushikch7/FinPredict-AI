import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { marked } from 'marked';
import { BookOpen, FileText, ListChecks, History, Loader2 } from 'lucide-react';

type DocTab = 'guide' | 'requirements' | 'readme' | 'changelog';

const tabs: { key: DocTab; label: string; icon: typeof BookOpen; file: string }[] = [
  { key: 'guide', label: 'User Guide', icon: BookOpen, file: 'USER_GUIDE' },
  { key: 'requirements', label: 'Requirements', icon: ListChecks, file: 'REQUIREMENTS' },
  { key: 'readme', label: 'README', icon: FileText, file: 'README' },
  { key: 'changelog', label: 'Changelog', icon: History, file: 'CHANGELOG' },
];

const validTabs: DocTab[] = ['guide', 'requirements', 'readme', 'changelog'];

// Configure marked for safe rendering
marked.setOptions({
  gfm: true,
  breaks: false,
});

export function DocsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as DocTab | null;
  const [active, setActive] = useState<DocTab>(validTabs.includes(tabParam!) ? tabParam! : 'guide');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam)) {
      setActive(tabParam);
    }
  }, [tabParam]);

  useEffect(() => {
    const tab = tabs.find((t) => t.key === active);
    if (!tab) return;
    setLoading(true);
    setError(null);
    fetch(`/api/docs/${tab.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${tab.label}`);
        return r.text();
      })
      .then((md) => {
        const html = marked(md) as string;
        setContent(html);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [active]);

  const handleTabChange = (tab: DocTab) => {
    setActive(tab);
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Documentation</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Single source of truth — synced from workspace root .md files</p>
      </header>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all whitespace-nowrap ${
              active === t.key
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Source file indicator */}
      <div className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
        Source: <span className="text-slate-600">{tabs.find((t) => t.key === active)?.file}.md</span>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-indigo-500" />
        </div>
      )}
      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}
      {!loading && !error && (
        <article
          className="prose-doc bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-sm"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  );
}
