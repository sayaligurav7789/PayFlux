/**
 * Partial refund tests. Requires Postgres + Redis running with
 * migrations applied.
 */
const request = require('supertest');
const { createApp } = require('../app');
const { pool } = require('../config/db');
const redis = require('../config/redis');
const gatewayA = require('../services/mockGateway');
const gatewayB = require('../services/mockGatewayB');

const app = createApp();
const API_KEY = 'dev_test_key_123';

async function cleanUp(idempotencyKey) {
  await pool.query(`DELETE FROM transactions WHERE idempotency_key = $1`, [idempotencyKey]);
}

async function createSuccessfulTransaction(amount) {
  // Both gateways healthy -> first attempt succeeds, no failover noise.
  await gatewayA.setForceFailure(false);
  await gatewayB.setForceFailure(false);

  const idempotencyKey = `refund-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let res;
  // The mock gateways still have a small random failure rate; retry
  // transaction creation with a fresh key until one lands on 'success'
  // so refund tests aren't flaky.
  for (let i = 0; i < 5; i++) {
    const key = `${idempotencyKey}-${i}`;
    res = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', key)
      .send({ amount, currency: 'INR' });
    if (res.body.transaction.status === 'success') {
      return res.body.transaction;
    }
    await cleanUp(key);
  }
  throw new Error('Could not get a successful transaction after 5 attempts');
}

describe('Partial refunds', () => {
  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  test('a partial refund moves the transaction to partially_refunded and tracks the remaining balance', async () => {
    const txn = await createSuccessfulTransaction(10000);

    const res = await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 4000, reason: 'partial_test' });

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('partially_refunded');
    expect(Number(res.body.transaction.refunded_amount)).toBe(4000);

    await cleanUp(txn.idempotency_key);
  });

  test('refunding the exact remaining balance settles it to refunded', async () => {
    const txn = await createSuccessfulTransaction(10000);

    await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 3000 });

    const res = await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 7000 });

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('refunded');
    expect(Number(res.body.transaction.refunded_amount)).toBe(10000);

    await cleanUp(txn.idempotency_key);
  });

  test('over-refunding is rejected and does not change the stored refunded_amount', async () => {
    const txn = await createSuccessfulTransaction(5000);

    await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 2000 });

    const res = await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 4000 }); // only 3000 remains

    expect(res.status).toBe(400);

    const { rows } = await pool.query(`SELECT refunded_amount, status FROM transactions WHERE id = $1`, [txn.id]);
    expect(Number(rows[0].refunded_amount)).toBe(2000);
    expect(rows[0].status).toBe('partially_refunded');

    await cleanUp(txn.idempotency_key);
  });

  test('omitting amount refunds whatever remains in full', async () => {
    const txn = await createSuccessfulTransaction(6000);

    await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({ amount: 1000 });

    const res = await request(app)
      .post(`/transactions/${txn.id}/refund`)
      .set('X-API-Key', API_KEY)
      .send({}); // no amount -> refund remaining 5000

    expect(res.status).toBe(200);
    expect(res.body.transaction.status).toBe('refunded');
    expect(Number(res.body.transaction.refunded_amount)).toBe(6000);

    await cleanUp(txn.idempotency_key);
  });

  test('refunding a non-existent transaction 404s', async () => {
    const res = await request(app)
      .post('/transactions/00000000-0000-0000-0000-000000000000/refund')
      .set('X-API-Key', API_KEY)
      .send({ amount: 100 });
    expect(res.status).toBe(404);
  });
});
