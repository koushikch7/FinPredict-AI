import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Card, Badge } from '../components/Card';
import { Button } from '../components/Button';
import { Field, Input, Select } from '../components/Field';
import { useToast } from '../lib/toast';

/**
 * Personal settings — per-user AI override (provider + key + model + base URL).
 * If left blank, the system default (admin-configured) AI is used.
 */
export function SettingsPage() {
  const { notify } = useToast();
  const [me, setMe] = useState<any>(null);
  const [form, setForm] = useState({ AI_PROVIDER: 'Gemini', AI_API_KEY: '', AI_MODEL: '', AI_BASE_URL: '' });
  const [busy, setBusy] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    api.admin.myAI().then((r: any) => {
      setMe(r);
      setForm({
        AI_PROVIDER: r.AI_PROVIDER || 'Gemini',
        AI_API_KEY: '',
        AI_MODEL: r.AI_MODEL || '',
        AI_BASE_URL: r.AI_BASE_URL || '',
      });
    }).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload: any = { AI_PROVIDER: form.AI_PROVIDER, AI_MODEL: form.AI_MODEL, AI_BASE_URL: form.AI_BASE_URL };
      if (form.AI_API_KEY) payload.AI_API_KEY = form.AI_API_KEY;
      await api.admin.saveMyAI(payload);
      notify('AI settings saved');
      const r: any = await api.admin.myAI();
      setMe(r);
      setForm((f) => ({ ...f, AI_API_KEY: '' }));
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r: any = await api.admin.testMyAI();
      notify(r.ok ? r.message : `Failed: ${r.message}`, r.ok ? 'success' : 'error');
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setBusy(false); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwdForm.new_password !== pwdForm.confirm_password) {
      notify('New passwords do not match', 'error');
      return;
    }
    setPwdBusy(true);
    try {
      await api.auth.changePassword({
        current_password: pwdForm.current_password,
        new_password: pwdForm.new_password,
      });
      notify('Password changed successfully', 'success');
      setPwdForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (e: any) { notify(e.message, 'error'); }
    finally { setPwdBusy(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Settings</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">Per-user preferences</p>
      </header>

      <Card title="Your AI Provider" subtitle="Override the system AI with your own key. Leave key blank to use the system default.">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            {me?.has_key ? <Badge variant="success">Custom key set</Badge> : <Badge>Using system default</Badge>}
          </div>
          <Field label="Provider">
            <Select value={form.AI_PROVIDER} onChange={(e) => setForm({ ...form, AI_PROVIDER: e.target.value })}>
              <option value="Arbiter">Arbiter — Smart router (12+ free providers, recommended)</option>
              <option value="Gemini">Google Gemini (free tier ~5 req/min)</option>
              <option value="OpenAI">OpenAI-compatible (OpenAI / Azure / vLLM / OpenRouter / etc.)</option>
            </Select>
          </Field>
          <Field label="Model" hint={form.AI_PROVIDER === 'Arbiter' ? 'Use "auto" to let Arbiter pick the best free-tier model per request.' : undefined}>
            <Input
              placeholder={
                form.AI_PROVIDER === 'OpenAI'
                  ? 'gpt-4o-mini'
                  : form.AI_PROVIDER === 'Arbiter'
                  ? 'auto'
                  : 'gemini-2.5-flash'
              }
              value={form.AI_MODEL}
              onChange={(e) => setForm({ ...form, AI_MODEL: e.target.value })}
            />
          </Field>
          {(form.AI_PROVIDER === 'OpenAI' || form.AI_PROVIDER === 'Arbiter') && (
            <Field
              label="Base URL"
              hint={
                form.AI_PROVIDER === 'Arbiter'
                  ? 'Default: https://arbiter.chkoushik.com/v1'
                  : 'OpenAI-compatible endpoint (default https://api.openai.com/v1)'
              }
            >
              <Input
                placeholder={
                  form.AI_PROVIDER === 'Arbiter'
                    ? 'https://arbiter.chkoushik.com/v1'
                    : 'https://api.openai.com/v1'
                }
                value={form.AI_BASE_URL}
                onChange={(e) => setForm({ ...form, AI_BASE_URL: e.target.value })}
              />
            </Field>
          )}
          <Field label="API Key" hint="Stored encrypted-at-rest in DB. Leave blank to keep existing.">
            <Input
              type="password"
              placeholder={me?.has_key ? '•••••••• (set)' : 'Paste your key'}
              value={form.AI_API_KEY}
              onChange={(e) => setForm({ ...form, AI_API_KEY: e.target.value })}
            />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button onClick={save} loading={busy}>Save</Button>
            <Button variant="secondary" onClick={test} loading={busy}>Test Connection</Button>
          </div>
        </div>
      </Card>

      <Card title="Change Password" subtitle="Update your login password. Requires your current password to confirm.">
        <form onSubmit={changePassword} className="space-y-4">
          <Field label="Current Password">
            <Input
              type="password"
              placeholder="Current password"
              value={pwdForm.current_password}
              onChange={(e) => setPwdForm({ ...pwdForm, current_password: e.target.value })}
              required
            />
          </Field>
          <Field label="New Password" hint="Minimum 8 characters.">
            <Input
              type="password"
              placeholder="New password"
              value={pwdForm.new_password}
              onChange={(e) => setPwdForm({ ...pwdForm, new_password: e.target.value })}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirm New Password">
            <Input
              type="password"
              placeholder="Repeat new password"
              value={pwdForm.confirm_password}
              onChange={(e) => setPwdForm({ ...pwdForm, confirm_password: e.target.value })}
              required
            />
          </Field>
          <div className="pt-2">
            <Button type="submit" loading={pwdBusy}>Change Password</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
