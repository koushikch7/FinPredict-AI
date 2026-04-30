import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button } from '../components/Button';
import { Field, Input, Select } from '../components/Field';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(data);
      nav('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign In" subtitle="Authenticate to continue">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Username">
          <Input value={data.username} onChange={(e) => setData({ ...data, username: e.target.value })} required />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
            required
          />
        </Field>
        {error && (
          <div className="text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <Button type="submit" loading={busy} className="w-full" size="lg">
          Authenticate
        </Button>
      </form>
      <div className="mt-6 pt-6 border-t border-[#141414]/10 text-center">
        <Link to="/register" className="text-[10px] uppercase tracking-widest font-bold hover:underline">
          New here? Create an account
        </Link>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState({ username: '', password: '', role: 'Admin' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(data);
      nav('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Register" subtitle="Create your FinPredict account">
      <form onSubmit={submit} className="space-y-5">
        <Field label="Username">
          <Input value={data.username} onChange={(e) => setData({ ...data, username: e.target.value })} required minLength={3} />
        </Field>
        <Field label="Password" hint="Minimum 8 characters">
          <Input
            type="password"
            minLength={8}
            value={data.password}
            onChange={(e) => setData({ ...data, password: e.target.value })}
            required
          />
        </Field>
        <Field label="Role">
          <Select value={data.role} onChange={(e) => setData({ ...data, role: e.target.value })}>
            <option value="Admin">Admin (first-time bootstrap only)</option>
            <option value="Analyst">Analyst</option>
            <option value="Viewer">Viewer</option>
          </Select>
        </Field>
        {error && (
          <div className="text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        <Button type="submit" loading={busy} className="w-full" size="lg">
          Create Account
        </Button>
      </form>
      <div className="mt-6 pt-6 border-t border-[#141414]/10 text-center">
        <Link to="/login" className="text-[10px] uppercase tracking-widest font-bold hover:underline">
          Already registered? Sign in
        </Link>
      </div>
    </AuthShell>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#F8F7F4]">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-md w-full bg-white border border-[#141414] p-10 shadow-[20px_20px_0px_0px_rgba(20,20,20,0.05)]"
      >
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-display font-black tracking-tighter uppercase leading-none mb-2">FinPredict</h1>
          <p className="text-[10px] uppercase tracking-[0.3em] opacity-50">AI Investment Manager</p>
          <h2 className="font-display text-2xl mt-6">{title}</h2>
          <p className="text-xs opacity-50 mt-1">{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}
