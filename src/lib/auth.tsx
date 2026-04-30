import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api } from './api';

export interface User {
  id: number;
  username: string;
  role: 'Viewer' | 'Analyst' | 'Admin' | 'Super Admin';
}

interface Ctx {
  user: User | null;
  loading: boolean;
  login: (data: { username: string; password: string }) => Promise<void>;
  register: (data: { username: string; password: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then((u: any) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (data: { username: string; password: string }) => {
    const res = (await api.auth.login(data)) as { user: User };
    setUser(res.user);
  };

  const register = async (data: { username: string; password: string; role?: string }) => {
    await api.auth.register(data);
    await login({ username: data.username, password: data.password });
  };

  const logout = async () => {
    await api.auth.logout();
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside provider');
  return c;
}
