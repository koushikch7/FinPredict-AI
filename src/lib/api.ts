export const API_BASE = '/api';

async function request<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  // Belt-and-suspenders: append a cache-buster on GETs so any intermediary
  // (Cloudflare, browser, ServiceWorker) cannot serve a stale entry while
  // origin Cache-Control: no-store propagates.
  let finalUrl = `${API_BASE}${url}`;
  if (method === 'GET') {
    finalUrl += (url.includes('?') ? '&' : '?') + '_=' + Date.now();
  }
  const res = await fetch(finalUrl, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(options.headers ?? {}),
    },
    ...options,
  });
  if (!res.ok) {
    let message = 'Request failed';
    try {
      const j = await res.json();
      message = j.error || j.message || message;
    } catch {}
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const json = (data: unknown) => ({ method: 'POST', body: JSON.stringify(data) });

export const api = {
  health: () => request('/health'),

  auth: {
    login: (data: { username: string; password: string }) => request('/auth/login', json(data)),
    register: (data: { username: string; password: string; role?: string }) => request('/auth/register', json(data)),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    changePassword: (data: { current_password: string; new_password: string }) =>
      request('/auth/change-password', json(data)),
  },

  stocks: {
    list: () => request('/stocks'),
    create: (data: { symbol: string; name: string; sector: string; exchange?: string }) => request('/stocks', json(data)),
    quote: (symbol: string) => request(`/stocks/${symbol}/quote`),
    history: (symbol: string, days = 90) => request(`/stocks/${symbol}/history?days=${days}`),
    technicals: (symbol: string) => request(`/stocks/${symbol}/technicals`),
    marketStatus: () => request('/stocks/market-status'),
  },

  portfolio: {
    list: () => request('/portfolio'),
    add: (data: { stock_id: number; quantity: number; average_price: number }) => request('/portfolio', json(data)),
    remove: (id: number) => request(`/portfolio/${id}`, { method: 'DELETE' }),
  },

  watchlist: {
    list: () => request('/watchlist'),
    add: (data: { stock_id: number; note?: string }) => request('/watchlist', json(data)),
    remove: (id: number) => request(`/watchlist/${id}`, { method: 'DELETE' }),
  },

  predictions: {
    list: (sort?: string) => request(`/predictions${sort ? `?sort=${sort}` : ''}`),
    strategies: () => request('/predictions/strategies'),
    accuracy: () => request('/predictions/accuracy'),
    generate: (data: { stock_id: number; horizon: string; strategy?: string }) => request('/predictions/generate', json(data)),
    runValidation: () => request('/predictions/validate', { method: 'POST' }),
    topPicks: (limit = 5, horizon: string = '1m') =>
      request('/predictions/top-picks', json({ limit, horizon })),
  },

  brokers: {
    list: () => request('/brokers'),
    saveCreds: (data: any) => request('/brokers/credentials', json(data)),
    loginUrl: (broker: string) => request(`/brokers/${broker}/login-url`),
    exchange: (broker: string, request_token: string) => request(`/brokers/${broker}/exchange-token`, json({ request_token })),
    sync: (broker: string) => request(`/brokers/${broker}/sync`, { method: 'POST' }),
    syncAll: () => request('/brokers/sync-all', { method: 'POST' }),
    remove: (broker: string) => request(`/brokers/${broker}`, { method: 'DELETE' }),
  },

  playground: {
    get: () => request('/playground/'),
    trades: () => request('/playground/trades'),
    equityCurve: () => request('/playground/equity-curve'),
    reset: (starting_capital: number) => request('/playground/reset', json({ starting_capital })),
    settings: (data: any) => request('/playground/settings', json(data)),
    trade: (data: {
      symbol: string;
      side: 'BUY' | 'SELL';
      quantity: number;
      horizon?: 'Intraday' | 'Short-term' | 'Long-term';
      reason?: string;
      strategy_tag?: string;
    }) => request('/playground/trade', json(data)),
    runAI: () => request('/playground/run-ai', { method: 'POST' }),
    strategyStats: () => request('/playground/strategy-stats'),
    quote: (symbol: string) => request(`/playground/quote/${encodeURIComponent(symbol)}`),
  },

  chat: {
    sessions: () => request('/chat/sessions'),
    messages: (id: number) => request(`/chat/sessions/${id}`),
    send: (data: { session_id?: number | null; content: string }) => request('/chat/send', json(data)),
  },

  news: {
    list: (symbols?: string[]) => request(`/news${symbols?.length ? `?symbols=${symbols.join(',')}` : ''}`),
  },

  ipo: {
    list: () => request('/ipo'),
    refreshAll: () => request('/ipo/refresh', { method: 'POST' }),
    analyseOne: (id: number) => request(`/ipo/${id}/analyse`, { method: 'POST' }),
  },

  discovery: {
    list: (limit = 50, direction?: 'BUY' | 'HOLD' | 'AVOID') =>
      request(`/discovery?limit=${limit}${direction ? `&direction=${direction}` : ''}`),
    scan: () => request('/discovery/scan', { method: 'POST' }),
  },

  admin: {
    config: () => request('/admin/config'),
    saveConfig: (data: { key: string; value: string; category?: string }) => request('/admin/config', json(data)),
    aiTest: () => request('/admin/ai/test'),
    aiModels: () => request('/admin/ai/models'),
    users: () => request('/admin/users'),
    createUser: (data: any) => request('/admin/users', json(data)),
    deleteUser: (id: number) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    syncLogs: () => request('/admin/sync/logs'),
    myAI: () => request('/admin/me/ai'),
    saveMyAI: (data: any) => request('/admin/me/ai', json(data)),
    testMyAI: () => request('/admin/me/ai/test', { method: 'POST' }),
  },

  backup: {
    status:  () => request('/admin/backups/status'),
    list:    () => request('/admin/backups/list'),
    storage: () => request('/admin/backups/storage'),
    create:  (type: 'daily' | 'weekly' | 'manual') =>
      request('/admin/backups/create', json({ type })),
    restore: (key: string) => request('/admin/backups/restore', json({ key })),
    delete:  (key: string) => request('/admin/backups/delete', json({ key })),
    cleanup: () => request('/admin/backups/cleanup', json({})),
  },
};
