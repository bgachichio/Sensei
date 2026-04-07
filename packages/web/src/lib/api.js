const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Health
  health: () => fetch('/health').then(r => r.json()),

  // Settings
  getSettings: () => request('/settings'),
  saveSettings: (data) => request('/settings', { method: 'POST', body: JSON.stringify(data) }),
  onboard: (data) => request('/onboarding', { method: 'POST', body: JSON.stringify(data) }),

  // Articles
  listArticles: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/articles?${qs}`);
  },
  getArticle: (id) => request(`/articles/${id}`),
  createArticle: (data) => request('/articles', { method: 'POST', body: JSON.stringify(data) }),
  updateArticle: (id, data) => request(`/articles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteArticle: (id) => request(`/articles/${id}`, { method: 'DELETE' }),

  // Search
  search: (q, params = {}) => {
    const qs = new URLSearchParams({ q, ...params }).toString();
    return request(`/search?${qs}`);
  },

  // Graph
  getGraph: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/graph?${qs}`);
  },
  getEntities: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/entities?${qs}`);
  },
  getPerson: (name) => request(`/people/${encodeURIComponent(name)}`),

  // Ingestion
  ingest: (data) => request('/ingest', { method: 'POST', body: JSON.stringify(data) }),
  reindex: () => request('/reindex', { method: 'POST' }),

  // Stats
  getStats: () => request('/stats'),

  // Connectors (file upload)
  importConnector: async (connector, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/connectors/${connector}/import`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },

  // Media upload
  uploadMedia: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/media`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Upload failed');
    return res.json();
  },

  // Webhook
  webhook: (data) => request('/webhook/ingest', { method: 'POST', body: JSON.stringify(data) }),

  // Generic request (for custom endpoints)
  request: (path, options) => request(path, options),

  // Proactive Intelligence
  parseUrl: (url) => request('/parse-url', { method: 'POST', body: JSON.stringify({ url }) }),
  generateBriefing: () => request('/briefing', { method: 'POST' }),
  parseImage: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/parse-image`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Parse failed');
    return res.json();
  },

  // Categories
  getCategories: () => request('/categories'),
  addCategory: (name) => request('/categories', { method: 'POST', body: JSON.stringify({ name }) }),

  // About
  getAbout: () => request('/about'),

  // AI Status
  getAIStatus: () => request('/ai/status'),

  // Sync
  getSyncStatus: () => request('/sync/status'),
  setSyncConfig: (connectorId, config) => request('/sync/config', { method: 'POST', body: JSON.stringify({ connectorId, config }) }),

  // Storage
  getStorageConfig: () => request('/storage/config')
};
