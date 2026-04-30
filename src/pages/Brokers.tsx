import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw, Trash2, CheckCircle2 } from 'lucide-react';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Field, Input } from '../components/Field';
import { useToast } from '../lib/toast';

interface BrokerInfo {
  broker: string;
  label: string;
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  expiry: string | null;
  hasSecret: boolean;
  systemDefault?: boolean;
  apiKey?: string | null;
  apiSecretMasked?: string | null;
}

export function BrokersPage() {
  const { notify } = useToast();
  const [list, setList] = useState<BrokerInfo[]>([]);
  const [hasAnyEnabled, setHasAny] = useState(false);
  const [forms, setForms] = useState<Record<string, { api_key: string; api_secret: string; request_token: string }>>({});

  const refresh = () => {
    api.brokers.list().then((r: any) => {
      setList(r.accounts);
      setHasAny(r.hasAnyEnabled);
      // Prefill forms from server so the inputs show what's already saved.
      const next: Record<string, { api_key: string; api_secret: string; request_token: string }> = {};
      for (const a of r.accounts as BrokerInfo[]) {
        next[a.broker] = {
          api_key: a.apiKey ?? '',
          api_secret: a.apiSecretMasked ?? '',
          request_token: '',
        };
      }
      setForms((prev) => ({ ...next, ...prev /* keep user-typed edits */ }));
    }).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);

  // Detect Kite redirect: ?request_token=...&action=login&status=success
  useEffect(() => {
    const url = new URL(window.location.href);
    const rt = url.searchParams.get('request_token');
    if (rt) {
      api.brokers.exchange('kite', rt)
        .then(() => { notify('Kite connected'); url.searchParams.delete('request_token'); url.searchParams.delete('action'); url.searchParams.delete('status'); window.history.replaceState({}, '', url.toString()); refresh(); })
        .catch((e) => notify(e.message, 'error'));
    }
  }, []);

  const setForm = (broker: string, patch: Partial<{ api_key: string; api_secret: string; request_token: string }>) =>
    setForms((f) => ({ ...f, [broker]: { ...{ api_key: '', api_secret: '', request_token: '' }, ...(f[broker] ?? {}), ...patch } }));

  const saveCreds = async (broker: string) => {
    const f = forms[broker];
    if (!f?.api_key) return notify('API key required', 'error');
    // If the secret field is showing a masked placeholder (••••xxxx), don't overwrite.
    const isMasked = !!f.api_secret && /^\u2022+/.test(f.api_secret);
    try {
      await api.brokers.saveCreds({
        broker,
        api_key: f.api_key,
        api_secret: isMasked ? undefined : (f.api_secret || undefined),
        enabled: true,
      });
      notify('Saved');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const startLogin = async (broker: string) => {
    try {
      const r: any = await api.brokers.loginUrl(broker);
      window.location.href = r.url;
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const exchange = async (broker: string) => {
    const f = forms[broker];
    if (!f?.request_token) return notify('Paste request_token', 'error');
    try {
      await api.brokers.exchange(broker, f.request_token);
      notify('Token exchanged');
      refresh();
    } catch (e: any) { notify(e.message, 'error'); }
  };

  const sync = async (broker: string) => {
    try { const r: any = await api.brokers.sync(broker); notify(`Synced ${r.count} holdings`); }
    catch (e: any) { notify(e.message, 'error'); }
  };

  const remove = async (broker: string) => {
    if (!confirm(`Remove ${broker}?`)) return;
    await api.brokers.remove(broker);
    refresh();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Brokers</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">
          {hasAnyEnabled
            ? <Badge variant="success"><CheckCircle2 size={10} className="inline mr-1" /> At least one broker connected</Badge>
            : <Badge variant="warning">Connect a broker to enable Playground &amp; auto-trading</Badge>}
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {list.map((b) => (
          <Card key={b.broker} title={b.label} subtitle={b.broker.toUpperCase()}>
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={b.configured ? 'success' : 'neutral'}>{b.configured ? 'Configured' : 'Not configured'}</Badge>
                <Badge variant={b.connected ? 'success' : 'neutral'}>{b.connected ? 'Connected' : 'Not connected'}</Badge>
                {b.systemDefault && <Badge variant="info">Using system default key</Badge>}
                {b.expiry && <Badge>Token until {fmtDate(b.expiry)}</Badge>}
              </div>

              {b.configured && !b.connected && b.broker === 'kite' && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <strong>Action required:</strong> Click <em>“Login with Kite”</em> below to authorise access. Kite tokens expire daily around 07:30 IST and must be refreshed via login.
                </div>
              )}

              {b.broker === 'kite' ? (
                <>
                  <Field label="API Key">
                    <Input value={forms[b.broker]?.api_key ?? ''} onChange={(e) => setForm(b.broker, { api_key: e.target.value })} placeholder="kite api_key" />
                  </Field>
                  <Field label="API Secret">
                    <Input type="password" value={forms[b.broker]?.api_secret ?? ''} onChange={(e) => setForm(b.broker, { api_secret: e.target.value })} placeholder="kite api_secret" />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveCreds(b.broker)}>Save Credentials</Button>
                    <Button variant="secondary" disabled={!b.configured} icon={<ExternalLink size={14} />} onClick={() => startLogin(b.broker)}>
                      Login with Kite
                    </Button>
                    <Button variant="secondary" disabled={!b.connected} icon={<RefreshCw size={14} />} onClick={() => sync(b.broker)}>
                      Sync Holdings
                    </Button>
                  </div>
                  <details className="text-xs">
                    <summary className="cursor-pointer opacity-70">Manual token paste</summary>
                    <div className="mt-2 space-y-2">
                      <Input
                        placeholder="Paste request_token from Kite redirect"
                        value={forms[b.broker]?.request_token ?? ''}
                        onChange={(e) => setForm(b.broker, { request_token: e.target.value })}
                      />
                      <Button size="sm" onClick={() => exchange(b.broker)}>Exchange Token</Button>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <p className="text-xs opacity-70">
                    {b.broker === 'paytm'
                      ? 'Paytm Money has a documented OAuth API; full integration requires dev approval. Save credentials below to mark this broker as enabled.'
                      : 'Live API integration is not yet available for this broker. You can mark it as enabled and import a CSV (manual import coming soon).'}
                  </p>
                  <Field label="API Key (optional)">
                    <Input value={forms[b.broker]?.api_key ?? ''} onChange={(e) => setForm(b.broker, { api_key: e.target.value })} />
                  </Field>
                  <Button onClick={() => saveCreds(b.broker)}>Mark as Enabled</Button>
                </>
              )}

              {b.configured && (
                <div className="pt-3 border-t border-[#141414]/5">
                  <Button variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(b.broker)}>Disconnect</Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
