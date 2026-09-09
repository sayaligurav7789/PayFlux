/**
 * This is the test to actually run and demo in an interview:
 * fire 10 concurrent identical requests, assert exactly one transaction
 * was created. It's the concrete proof that the dual-layer idempotency
 * design (Redis lock + Postgres unique constraint) actually holds under
 * real concurrency, not just in theory.
 *
 * Requires Postgres + Redis running (see docker-compose.yml) and
 * migrations applied (`npm run migrate`) against a TEST database.
 * Set DATABASE_URL / REDIS_URL via .env before running `npm test`.
 */

const request = require('supertest');
const { createApp } = require('../app');
const { pool } = require('../config/db');
const redis = require('../config/redis');

const app = createApp();
const API_KEY = 'dev_test_key_123'; // seeded in migrations/001_init.sql

async function cleanUp(idempotencyKey) {
  await pool.query(`DELETE FROM transactions WHERE idempotency_key = $1`, [idempotencyKey]);
}

describe('POST /transactions idempotency', () => {
  afterAll(async () => {
    await pool.end();
    redis.disconnect();
  });

  test('10 concurrent identical requests create exactly one transaction', async () => {
    const idempotencyKey = `concurrency-test-${Date.now()}`;
    await cleanUp(idempotencyKey);

    const fireRequest = () =>
      request(app)
        .post('/transactions')
        .set('X-API-Key', API_KEY)
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 5000, currency: 'INR' });

    const responses = await Promise.all(Array.from({ length: 10 }, fireRequest));

    // Every response should be a success or a 409 "in progress" -- never
    // a raw 500, and never a second distinct transaction.
    for (const res of responses) {
      expect([200, 201, 409]).toContain(res.status);
    }

    const { rows } = await pool.query(
      `SELECT * FROM transactions WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    expect(rows.length).toBe(1);

    await cleanUp(idempotencyKey);
  });

  test('a second request with a fresh key creates a separate transaction', async () => {
    const keyA = `unique-test-a-${Date.now()}`;
    const keyB = `unique-test-b-${Date.now()}`;

    const resA = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', keyA)
      .send({ amount: 1000, currency: 'INR' });
    const resB = await request(app)
      .post('/transactions')
      .set('X-API-Key', API_KEY)
      .set('Idempotency-Key', keyB)
      .send({ amount: 1000, currency: 'INR' });

    expect(resA.body.transaction.id).not.toBe(resB.body.transaction.id);

    await cleanUp(keyA);
    await cleanUp(keyB);
  });
});
