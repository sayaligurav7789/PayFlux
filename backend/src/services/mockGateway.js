/**
 * Simulates an external payment gateway: random latency, and a
 * configurable chance of failure so the retry logic has something real
 * to exercise. In a real integration this file would be an HTTP client
 * for Stripe/Razorpay/etc — everything downstream of it doesn't care
 * which.
 *
 * This is "Gateway A". It implements the same interface as Gateway B
 * (mockGatewayB.js): an async charge({amount, currency}) that resolves
 * with {gatewayReference} or throws RetryableGatewayError /
 * NonRetryableGatewayError. The routing engine and failover logic only
 * depend on that shape, never on which gateway they're talking to.
 */
const redis = require('../config/redis');
const { recordGatewayCall } = require('../middleware/metrics');

const GATEWAY_ID = 'gateway_a';
const FORCE_FAILURE_KEY = `gateway:force_failure:${GATEWAY_ID}`;

class RetryableGatewayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RetryableGatewayError';
    this.retryable = true;
  }
}

class NonRetryableGatewayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NonRetryableGatewayError';
    this.retryable = false;
  }
}

const FAILURE_RATE = Number(process.env.MOCK_GATEWAY_FAILURE_RATE || 15);
const MIN_LATENCY = Number(process.env.MOCK_GATEWAY_MIN_LATENCY_MS || 100);
const MAX_LATENCY = Number(process.env.MOCK_GATEWAY_MAX_LATENCY_MS || 600);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{amount: number, currency: string}} params
 * @returns {Promise<{gatewayReference: string}>}
 */
async function charge({ amount, currency }) {
  const latency = MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY);
  await sleep(latency);

  // Demo/testing hook: lets the Routing page (or a test) force this
  // gateway to fail deterministically, so "Gateway A fails -> failover
  // to Gateway B" can be demoed reliably instead of waiting on a random
  // roll. Backed by Redis (not an in-memory flag) so the toggle takes
  // effect no matter which of the three API instances handles the
  // actual charge request.
  const forced = await redis.get(FORCE_FAILURE_KEY).catch(() => null);
  if (forced === '1') {
    recordGatewayCall(false);
    throw new RetryableGatewayError('forced_failure_demo');
  }

  const roll = Math.random() * 100;

  if (roll < FAILURE_RATE * 0.15) {
    recordGatewayCall(false);
    throw new NonRetryableGatewayError('insufficient_funds');
  }
  if (roll < FAILURE_RATE) {
    recordGatewayCall(false);
    throw new RetryableGatewayError('gateway_timeout');
  }

  recordGatewayCall(true);
  return { gatewayReference: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` };
}

async function setForceFailure(enabled) {
  await redis.set(FORCE_FAILURE_KEY, enabled ? '1' : '0');
}

module.exports = {
  charge, RetryableGatewayError, NonRetryableGatewayError,
  setForceFailure, id: GATEWAY_ID, label: 'Gateway A',
};
