import { useEffect, useRef, useState } from 'react';
import { Send, Plus, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/Button';
import { useToast } from '../lib/toast';

export function ChatPage() {
  const { notify } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = () => api.chat.sessions().then((s: any) => setSessions(s)).catch(() => {});

  useEffect(() => { loadSessions(); }, []);
  useEffect(() => {
    if (activeId) api.chat.messages(activeId).then(setMessages).catch(() => setMessages([]));
    else setMessages([]);
  }, [activeId]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const userMsg = { role: 'user', content: text, created_at: new Date().toISOString() };
    setMessages((m) => [...m, userMsg]);
    const content = text;
    setText('');
    try {
      const r: any = await api.chat.send({ session_id: activeId, content });
      if (!activeId) {
        setActiveId(r.sessionId);
        loadSessions();
      }
      setMessages((m) => [...m, { role: 'assistant', content: r.reply, created_at: new Date().toISOString() }]);
    } catch (e: any) {
      notify(e.message, 'error');
      setMessages((m) => m.slice(0, -1));
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 h-[calc(100vh-6rem)] flex flex-col">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">AI Chat</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Ask anything: stocks, sectors, strategies, news</p>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4 min-h-0">
        <aside className="bg-white border border-[#141414]/10 p-3 flex flex-col gap-2 max-h-full overflow-hidden">
          <Button size="sm" icon={<Plus size={12} />} onClick={() => { setActiveId(null); setMessages([]); }}>New Chat</Button>
          <div className="flex-1 overflow-y-auto space-y-1 mt-2">
            {sessions.map((s: any) => (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${
                  activeId === s.id ? 'bg-[#141414] text-[#F8F7F4]' : 'hover:bg-[#141414]/5'
                }`}
              >
                <MessageSquare size={12} />
                <span className="truncate">{s.title}</span>
              </button>
            ))}
            {sessions.length === 0 && <p className="text-[10px] opacity-50 text-center py-4">No sessions yet</p>}
          </div>
        </aside>

        <section className="bg-white border border-[#141414]/10 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center opacity-60 text-sm">
                <div>
                  <MessageSquare size={32} className="mx-auto mb-3 opacity-50" />
                  Ask about a stock, e.g. "Is RELIANCE a buy at current levels?"
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[#141414] text-[#F8F7F4]'
                      : 'bg-[#F8F7F4] border border-[#141414]/20'
                  }`}>{m.content}</div>
                </div>
              ))
            )}
            {busy && <div className="text-xs opacity-50 italic">FinPredict is thinking…</div>}
            <div ref={bottomRef} />
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="border-t border-[#141414]/10 p-4 flex gap-2"
          >
            <input
              className="flex-1 bg-[#F8F7F4] border border-[#141414] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Ask about any stock, strategy or news…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" loading={busy} icon={<Send size={14} />}>Send</Button>
          </form>
        </section>
      </div>
    </div>
  );
}
