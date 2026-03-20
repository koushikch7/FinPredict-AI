const API_BASE = '/api';

async function request(url: string, options: any = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  auth: {
    login: (data: any) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: any) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    me: () => request('/auth/me'),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  stocks: {
    list: () => request('/stocks'),
    create: (data: any) => request('/stocks', { method: 'POST', body: JSON.stringify(data) }),
  },
  portfolio: {
    list: () => request('/portfolio'),
    add: (data: any) => request('/portfolio', { method: 'POST', body: JSON.stringify(data) }),
  },
  predictions: {
    list: (sort?: string) => request(`/predictions${sort ? `?sort=${sort}` : ''}`),
    generate: (data: any) => request('/predictions/generate', { method: 'POST', body: JSON.stringify(data) }),
  },
  admin: {
    getConfig: () => request('/admin/config'),
    updateConfig: (data: any) => request('/admin/config', { method: 'POST', body: JSON.stringify(data) }),
    testConnection: (data: any) => request('/admin/test-connection', { method: 'POST', body: JSON.stringify(data) }),
    fetchModels: () => request('/admin/fetch-models'),
    getUsers: () => request('/admin/users'),
    createUser: (data: any) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    syncKite: () => request('/admin/sync/kite', { method: 'POST' }),
    getSyncLogs: () => request('/admin/sync/logs'),
  }
};
