const redis = require('../config/redis');

const LOCK_TTL_SECONDS = 30; // how long a "processing" lock is held
const RESULT_TTL_SECONDS = 60 * 60 * 24; // how long a cached response is kept

const key = (merchantId, idempotencyKey) => `idem:${merchantId}:${idempotencyKey}`;

/**
 * Attempts to acquire the idempotency lock for a request.
 *
 * Returns one of:
 *   { state: 'acquired' }               -> caller should proceed and process the request
 *   { state: 'in_progress' }            -> an identical request is currently being processed
 *   { state: 'cached', response: {...} } -> this request was already completed; return the stored response
 *
 * This is layer 1 (fast path). Layer 2 is the Postgres UNIQUE constraint
 * on (merchant_id, idempotency_key), which is the backstop in case two
 * requests somehow both pass this check (e.g. Redis had a brief blip).
 */
async function acquireLock(merchantId, idempotencyKey) {
  const redisKey = key(merchantId, idempotencyKey);

  // SET key "processing" NX EX 30 -- atomic "acquire if absent"
  const acquired = await redis.set(redisKey, JSON.stringify({ status: 'processing' }), 'EX', LOCK_TTL_SECONDS, 'NX');

  if (acquired === 'OK') {
    return { state: 'acquired' };
  }

  const existing = await redis.get(redisKey);
  if (!existing) {
    // Extremely rare race: key expired between the failed SET and this GET.
    // Treat as acquired so the caller doesn't hang.
    return { state: 'acquired' };
  }

  const parsed = JSON.parse(existing);
  if (parsed.status === 'processing') {
    return { state: 'in_progress' };
  }
  return { state: 'cached', response: parsed.response };
}

/**
 * Stores the final response against the idempotency key with a long TTL,
 * so future retries of the same key get the cached result immediately
 * without hitting the DB or the mock gateway again.
 */
async function storeResult(merchantId, idempotencyKey, response) {
  const redisKey = key(merchantId, idempotencyKey);
  await redis.set(
    redisKey,
    JSON.stringify({ status: 'completed', response }),
    'EX',
    RESULT_TTL_SECONDS
  );
}

/**
 * Releases the lock without caching a result — used when request
 * processing fails outright (e.g. validation error) and the client
 * should be allowed to retry immediately rather than wait out the lock TTL.
 */
async function releaseLock(merchantId, idempotencyKey) {
  const redisKey = key(merchantId, idempotencyKey);
  await redis.del(redisKey);
}

module.exports = { acquireLock, storeResult, releaseLock };
