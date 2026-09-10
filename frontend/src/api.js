const API_KEY = 'dev_test_key_123';

const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  });

  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      body.error || `Request failed with status ${res.status}`
    );
  }

  return body;
}

export const api = {
  // =========================
  // AUTH
  // =========================

  login: (email, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
      }),
    }),

  me: () => {
    const token = localStorage.getItem('authToken');

    return request('/auth/me', {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    });
  },

  // =========================
  // TRANSACTIONS
  // =========================

  listTransactions: ({
    status,
    search,
    limit,
    offset,
  } = {}) => {
    const params = new URLSearchParams();

    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (limit) params.set('limit', limit);
    if (offset) params.set('offset', offset);

    const qs = params.toString();

    return request(
      `/transactions${qs ? `?${qs}` : ''}`
    );
  },

  getAnalytics: () =>
    request('/transactions/analytics'),

  getTransaction: (id) =>
    request(`/transactions/${id}`),

  getEvents: (id) =>
    request(`/transactions/${id}/events`),

  getWebhooks: (id) =>
    request(`/transactions/${id}/webhooks`),

  // =========================
  // HEALTH
  // =========================

  getHealth: () =>
    request('/health'),

  // =========================
  // WEBHOOKS
  // =========================

  listAllWebhooks: () =>
    request('/webhooks'),

  // =========================
  // CREATE TRANSACTION
  // =========================

  createTransaction: ({
    amount,
    currency,
    idempotencyKey,
  }) =>
    request('/transactions', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        amount,
        currency,
      }),
    }),

  // =========================
  // REFUND
  // =========================

  refund: (id, { amount, reason } = {}) =>
    request(`/transactions/${id}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        amount,
        reason,
      }),
    }),

  // =========================
  // ROUTING & GATEWAY HEALTH
  // =========================

  getRoutingConfig: () => request('/routing/config'),

  updateRoutingConfig: ({ strategy, weightGatewayA, weightGatewayB }) =>
    request('/routing/config', {
      method: 'PUT',
      body: JSON.stringify({ strategy, weightGatewayA, weightGatewayB }),
    }),

  getGatewayHealth: () => request('/routing/health'),

  forceGatewayFailure: (gatewayId, enabled) =>
    request(`/routing/simulate/${gatewayId}/force-failure`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};