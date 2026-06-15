import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Field, Input, Select } from '../components/Field';
import { fmtDate } from '../lib/format';
import { useToast } from '../lib/toast';

export function AdminPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState<'config' | 'ai' | 'users' | 'logs'>('config');
  const [configs, setConfigs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'Analyst' });
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    api.admin.config().then(setConfigs).catch(() => {});
    api.admin.users().then(setUsers).catch(() => {});
    api.admin.syncLogs().then(setLogs).catch(() => {});
  };
  useEffect(refresh, []);

  const setCfg = async (key: string, value: string, category?: string) => {
    try { await api.admin.saveConfig({ key, value, category }); notify(`Saved ${key}`); refresh(); }
    catch (e: any) { notify(e.message, 'error'); }
  };

  const fetchModels = async () => {
    setBusy(true);
    try { const r: any = await api.admin.aiModels(); setModels(r); notify(`${r.length} models`); }
    catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const testAI = async () => {
    setBusy(true);
    try { const r: any = await api.admin.aiTest(); notify(r.ok ? r.message : r.message, r.ok ? 'success' : 'error'); }
    catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.admin.createUser(newUser);
      setNewUser({ username: '', password: '', role: 'Analyst' });
      notify('User created');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const categories = Array.from(new Set(configs.map((c) => c.category)));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Admin</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">System administration</p>
      </header>

      <div className="flex gap-2 border-b border-[#141414]/10 pb-3">
        {(['config', 'ai', 'users', 'logs'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[10px] uppercase tracking-widest font-bold px-4 py-2 ${
              tab === t ? 'bg-[#141414] text-[#F8F7F4]' : 'opacity-50 hover:opacity-80'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {categories.map((cat) => (
            <Card key={cat} title={`${cat} Configuration`}>
              <div className="space-y-3">
                {configs.filter((c) => c.category === cat).map((c) => (
                  <div key={c.key}>
                    <label className="col-header block mb-1">{c.key.replace(/_/g, ' ')}</label>
                    <Input
                      type={c.is_secret ? 'password' : 'text'}
                      defaultValue={c.is_secret ? '' : c.value}
                      placeholder={c.is_secret && c.has_value ? c.value : undefined}
                      onBlur={(e) => {
                        const v = (e.target as HTMLInputElement).value;
                        // Never write the masked placeholder back over a real secret —
                        // only save a secret when the admin actually types a new value.
                        if (c.is_secret && !v) return;
                        setCfg(c.key, v, c.category);
                      }}
                    />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'ai' && (
        <Card title="AI Provider Diagnostics">
          <div className="flex flex-wrap gap-2 mb-4">
            <Button onClick={testAI} loading={busy}>Test System AI</Button>
            <Button variant="secondary" onClick={fetchModels} loading={busy}>Fetch Models</Button>
          </div>
          {models.length > 0 && (
            <div className="text-sm space-y-1">
              {models.map((m) => (
                <div key={m.id} className="flex justify-between border-b border-[#141414]/5 py-1 font-mono">
                  <span>{m.id}</span>
                  <span className="opacity-70">{m.name}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Add User">
            <form onSubmit={createUser} className="space-y-3">
              <Field label="Username"><Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} required /></Field>
              <Field label="Password"><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} required minLength={8} /></Field>
              <Field label="Role">
                <Select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                  <option>Viewer</option><option>Analyst</option><option>Admin</option><option>Super Admin</option>
                </Select>
              </Field>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </Card>
          <Card title={`Users (${users.length})`}>
            {users.map((u: any) => (
              <div key={u.id} className="flex justify-between items-center border-b border-[#141414]/5 py-2 text-sm">
                <span className="font-bold">{u.username}</span>
                <Badge>{u.role}</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'logs' && (
        <Card title="Sync Logs">
          <div className="space-y-1 text-xs max-h-[600px] overflow-y-auto">
            {logs.length === 0 ? <div className="opacity-50 text-center py-4">No logs yet</div> :
              logs.map((l: any) => (
                <div key={l.id} className="flex justify-between border-b border-[#141414]/5 py-2">
                  <span className="font-mono opacity-50">{fmtDate(l.timestamp)}</span>
                  <span className="font-bold">{l.service}</span>
                  <span className="opacity-70 flex-1 mx-3 truncate">{l.message}</span>
                  <Badge variant={l.status === 'SUCCESS' ? 'success' : 'danger'}>{l.status}</Badge>
                </div>
              ))}
          </div>
        </Card>
      )}
    </div>
  );
}
