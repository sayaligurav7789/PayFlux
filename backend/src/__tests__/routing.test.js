/**
 * Routing engine tests. Requires Postgres + Redis running with
 * migrations applied (same requirement as idempotency.test.js).
 */
const request = require('supertest');
const { createApp } = require('../app');
const { pool } = require('../config/db');
const redis = require('../config/redis');

const app = createApp();
const API_KEY = 'dev_test_key_123';

async function resetRoutingConfig() {
  await pool.query(
    `UPDATE routing_config SET strategy = 'round_robin', weight_gateway_a = 50, weight_gateway_b = 50 WHERE id = 1`
  );
  await redis.del('routing:round_robin:counter');
}

describe('Routing engine', () => {
  beforeEach(resetRoutingConfig);

  afterAll(async () => {
    await resetRoutingConfig();
    await pool.end();
    redis.disconnect();
  });

  test('GET /routing/config returns the current strategy and weights', async () => {
    const res = await request(app).get('/routing/config').set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      strategy: 'round_robin',
      weights: { gateway_a: 50, gateway_b: 50 },
    });
  });

  test('PUT /routing/config rejects an unknown strategy', async () => {
    const res = await request(app)
      .put('/routing/config')
      .set('X-API-Key', API_KEY)
      .send({ strategy: 'quantum_random' });
    expect(res.status).toBe(400);
  });

  test('PUT /routing/config rejects weights that sum to zero', async () => {
    const res = await request(app)
      .put('/routing/config')
      .set('X-API-Key', API_KEY)
      .send({ strategy: 'weighted', weightGatewayA: 0, weightGatewayB: 0 });
    expect(res.status).toBe(400);
  });

  test('round robin alternates between gateway_a and gateway_b across the routing engine directly', async () => {
    const routingService = require('../services/routingService');
    const decisions = [];
    for (let i = 0; i < 6; i++) {
      const { gatewayId } = await routingService.selectGateway();
      decisions.push(gatewayId);
    }
    // Should strictly alternate given a fresh counter.
    for (let i = 1; i < decisions.length; i++) {
      expect(decisions[i]).not.toBe(decisions[i - 1]);
    }
    expect(new Set(decisions)).toEqual(new Set(['gateway_a', 'gateway_b']));
  });

  test('weighted routing with 100/0 weights always picks gateway_a', async () => {
    await request(app)
      .put('/routing/config')
      .set('X-API-Key', API_KEY)
      .send({ strategy: 'weighted', weightGatewayA: 100, weightGatewayB: 0 });

    const routingService = require('../services/routingService');
    for (let i = 0; i < 10; i++) {
      const { gatewayId } = await routingService.selectGateway();
      expect(gatewayId).toBe('gateway_a');
    }
  });

  test('weighted routing with 0/100 weights always picks gateway_b', async () => {
    await request(app)
      .put('/routing/config')
      .set('X-API-Key', API_KEY)
      .send({ strategy: 'weighted', weightGatewayA: 0, weightGatewayB: 100 });

    const routingService = require('../services/routingService');
    for (let i = 0; i < 10; i++) {
      const { gatewayId } = await routingService.selectGateway();
      expect(gatewayId).toBe('gateway_b');
    }
  });
});
