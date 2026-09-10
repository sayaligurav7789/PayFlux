/**
 * "Gateway B" -- a second mock payment gateway implementing the exact
 * same interface as Gateway A (mockGateway.js): async
 * charge({amount, currency}) => {gatewayReference}, throwing
 * RetryableGatewayError / NonRetryableGatewayError on failure.
 *
 * Kept as a near-mirror of Gateway A on purpose: the point of having
 * two gateways behind a shared interface is that routing/failover code
 * never needs to know which one it's calling. Its failure rate and
 * latency profile are independently configurable via env vars so the
 * two gateways can behave differently for demo purposes (e.g. showing
 * health-based routing actually preferring the healthier one).
 */
const redis = require('../config/redis');
const { recordGatewayCall } = require('../middleware/metrics');
const { RetryableGatewayError, NonRetryableGatewayError } = require('./mockGateway');

const GATEWAY_ID = 'gateway_b';
const FORCE_FAILURE_KEY = `gateway:force_failure:${GATEWAY_ID}`;

const FAILURE_RATE = Number(process.env.MOCK_GATEWAY_B_FAILURE_RATE || 15);
const MIN_LATENCY = Number(process.env.MOCK_GATEWAY_B_MIN_LATENCY_MS || 100);
const MAX_LATENCY = Number(process.env.MOCK_GATEWAY_B_MAX_LATENCY_MS || 600);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{amount: number, currency: string}} params
 * @returns {Promise<{gatewayReference: string}>}
 */
async function charge({ amount, currency }) {
  const latency = MIN_LATENCY + Math.random() * (MAX_LATENCY - MIN_LATENCY);
  await sleep(latency);

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
  return { gatewayReference: `mockb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}` };
}

async function setForceFailure(enabled) {
  await redis.set(FORCE_FAILURE_KEY, enabled ? '1' : '0');
}

module.exports = {
  charge, RetryableGatewayError, NonRetryableGatewayError,
  setForceFailure, id: GATEWAY_ID, label: 'Gateway B',
};
