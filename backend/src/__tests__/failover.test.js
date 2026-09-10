/**
 * The most important demo in this project: Gateway A fails, gets
 * retried, keeps failing, and the system automatically fails over to
 * Gateway B -- without losing idempotency or transaction consistency,
 * and with every attempt/failover recorded in transaction_events.
 *
 * Uses the Redis-backed force-failure switch (the same one the Routing
 * page's demo controls use) to make Gateway A's failure deterministic
 * instead of relying on its ~15% random failure rate.
 *
 * Requires Postgres + Redis running with migrations applied.
 */
const request = require('supertest');
const { createApp } = require('../app');
const { pool } = require('../config/db');
const redis = require('../config/redis');
const gatewayA = require('../services/mockGateway');
const gatewayB = require('../services/mockGatewayB');

const app = createApp();
const API_KEY = 'dev_test_key_123';

async function forceGatewayAToPrimary() {
  // Weighted 100/0 guarantees gateway_a is always selected as the
  // primary, so the test doesn't depend on round-robin's current phase.
  await pool.query(
    `UPDATE routing_config SET strategy = 'weighted', weight_gateway_a = 100, weight_gateway_b = 0 WHERE id = 1`
  );
}

async function resetRoutingConfig() {
  await pool.query(
    `UPDATE routing_config SET strategy = 'round_robin', weight_gateway_a = 50, weight_gateway_b = 50 WHERE id = 1`
  );
  await gatewayA.setForceFailure(false);
  await gatewayB.setForceFailure(false);
}

async function cleanUp(idempotencyKey) {
  await pool.query(`DELETE FROM transactions WHERE idempotency_key = $1`, [idempotencyKey]);
}

describe('Automatic failover', () => {
  beforeEach(async () => {
    await forceGatewayAToPrimary();
  });

  afterEach(resetRoutingConfig);

  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  test('Gateway A fails -> retries -> fails over to Gateway B -> success', async () => {
    await gatewayA.setForceFailure(true);
    const idempotencyKey = `failover-test-${Date.now()}`;
    await cleanUp(idempotencyKey);

    const res = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: 5000, currency: 'INR' });

    expect(res.status).toBe(201);
    expect(res.body.transaction.status).toBe('success');
    expect(res.body.transaction.gateway_used).toBe('gateway_b');
    expect(res.body.transaction.retry_count).toBeGreaterThan(0);

    // Every attempt and the failover itself must be visible in the audit trail.
    const eventsRes = await request(app)
      .get(`/transactions/${res.body.transaction.id}/events`)
      .set('X-API-Key', API_KEY);
    const reasons = eventsRes.body.events.map((e) => e.reason);

    expect(reasons.some((r) => r.includes('Gateway A attempt failed'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('Failover triggered'))).toBe(true);
    expect(reasons.some((r) => r.startsWith('Failover succeeded'))).toBe(true);
    expect(reasons.some((r) => r.includes('Gateway B attempt succeeded'))).toBe(true);

    // Gateway health must reflect both the failing and the succeeding gateway.
    const healthRes = await request(app).get('/routing/health').set('X-API-Key', API_KEY);
    expect(healthRes.body.gateways.gateway_a.failures).toBeGreaterThan(0);
    expect(healthRes.body.gateways.gateway_b.successes).toBeGreaterThan(0);

    await cleanUp(idempotencyKey);
  });

  test('both gateways failing results in a failed transaction, not a crash', async () => {
    await gatewayA.setForceFailure(true);
    await gatewayB.setForceFailure(true);
    const idempotencyKey = `failover-both-fail-${Date.now()}`;
    await cleanUp(idempotencyKey);

    const res = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: 2500, currency: 'INR' });

    expect(res.status).toBe(201);
    expect(res.body.transaction.status).toBe('failed');
    expect(res.body.transaction.gateway_used).toBe('gateway_b'); // last gateway attempted

    await cleanUp(idempotencyKey);
  });

  test('idempotency is preserved across a failover: retried request returns the same transaction', async () => {
    await gatewayA.setForceFailure(true);
    const idempotencyKey = `failover-idempotency-${Date.now()}`;
    await cleanUp(idempotencyKey);

    const first = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: 4200, currency: 'INR' });

    const second = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', idempotencyKey)
      .send({ amount: 4200, currency: 'INR' });

    expect(first.body.transaction.id).toBe(second.body.transaction.id);

    const { rows } = await pool.query(
      `SELECT * FROM transactions WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(rows.length).toBe(1);

    await cleanUp(idempotencyKey);
  });
});
