const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export async function fetchApi(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const message = errBody?.detail?.error?.message || errBody?.detail || `API error ${res.status}`;
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
    }
    // For CSV download or raw streams
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      return res.blob();
    }
    return await res.json();
  } catch (err) {
    console.error(`API Fetch Error [${endpoint}]:`, err);
    throw err;
  }
}

export const api = {
  // Health
  getHealth: () => fetchApi('/health'),

  // Datasets
  generateDataset: (data) =>
    fetchApi('/datasets/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getDatasetSummary: (version) => fetchApi(`/datasets/${version}`),

  // Reconciliation
  startReconcileRun: (data) =>
    fetchApi('/reconcile/run', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  listRuns: () => fetchApi('/reconcile/runs'),
  getRunSummary: (runId) => fetchApi(`/reconcile/${runId}/summary`),
  getMatches: (runId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/reconcile/${runId}/matches${query ? `?${query}` : ''}`);
  },
  getExceptions: (runId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/reconcile/${runId}/exceptions${query ? `?${query}` : ''}`);
  },
  getAuditLog: (runId, params = {}) => {
    const query = new URLSearchParams(params).toString();
    return fetchApi(`/reconcile/${runId}/audit-log${query ? `?${query}` : ''}`);
  },
  exportExceptionsCsv: (runId) => fetchApi(`/reconcile/${runId}/exceptions/export`),

  // Settlement Q&A
  askQuestion: (data) =>
    fetchApi('/qa/ask', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getQaHistory: (sessionId) => fetchApi(`/qa/history/${sessionId}`),
};
