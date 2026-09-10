/**
 * Ties together the routing engine, the gateway registry, retry, and
 * automatic failover into the single call the /transactions route makes.
 *
 * Flow for one charge:
 *   1. Ask the routing engine which gateway to try first.
 *   2. Attempt it with exponential-backoff retry (retryWithBackoff),
 *      logging every attempt to transaction_events + gateway_attempts.
 *   3. If it's still failing after exhausting retries *and* the failure
 *      is retryable (a business decline like insufficient_funds is not
 *      retried or failed over -- that's not a gateway problem, retrying
 *      it elsewhere wouldn't change the outcome), automatically switch
 *      to the other gateway and repeat.
 *   4. If the second gateway also exhausts its retries, the whole charge
 *      fails -- the caller (routes/transactions.js) turns that into the
 *      existing gatewayFailure state transition, same as before this
 *      feature existed.
 *
 * This function is called from inside the same idempotency-locked,
 * single-transaction-row flow that already existed -- it doesn't change
 * anything about how idempotency or the state machine work, it's just a
 * (possibly two-gateway) implementation of "call the gateway."
 */
const { retryWithBackoff } = require('../utils/retry');
const transactionService = require('./transactionService');
const gatewayHealthService = require('./gatewayHealthService');
const routingService = require('./routingService');
const { getGateway, otherGateway } = require('./gatewayRegistry');

const MAX_ATTEMPTS_PER_GATEWAY = Number(process.env.GATEWAY_MAX_ATTEMPTS || 2);
const RETRY_BASE_DELAY_MS = Number(process.env.GATEWAY_RETRY_BASE_DELAY_MS || 300);

/**
 * Attempts a charge on a single gateway with retry, logging every
 * attempt (success or failure) to both transaction_events (for the
 * human-readable orchestration timeline) and gateway_attempts (for
 * health metrics + routing decisions).
 */
async function attemptGateway(gatewayId, txn, { amount, currency }) {
  const gateway = getGateway(gatewayId);

  return retryWithBackoff(
    async () => {
      const start = Date.now();
      try {
        const result = await gateway.charge({ amount, currency });
        const latencyMs = Date.now() - start;
        await Promise.all([
          gatewayHealthService.recordAttempt({
            transactionId: txn.id, gatewayId, outcome: 'success', latencyMs,
          }),
          transactionService.logOrchestrationEvent(
            txn.id, txn.status, `${gateway.label} attempt succeeded (${latencyMs}ms)`
          ),
        ]);
        return result;
      } catch (err) {
        const latencyMs = Date.now() - start;
        const outcome = err.retryable ? 'retryable_failure' : 'non_retryable_failure';
        await Promise.all([
          gatewayHealthService.recordAttempt({
            transactionId: txn.id, gatewayId, outcome, latencyMs, errorReason: err.message,
          }),
          transactionService.logOrchestrationEvent(
            txn.id, txn.status, `${gateway.label} attempt failed: ${err.message}`
          ),
        ]);
        throw err;
      }
    },
    {
      maxAttempts: MAX_ATTEMPTS_PER_GATEWAY,
      baseDelayMs: RETRY_BASE_DELAY_MS,
      isRetryable: (err) => err.retryable === true,
      onRetry: async () => {
        await transactionService.incrementRetryCount(txn.id);
      },
    }
  );
}

/**
 * @returns {Promise<{gatewayReference: string, gatewayUsed: string}>}
 * @throws the last gateway error, with `.lastGatewayId` attached so the
 *   caller can still record which gateway was last attempted even on
 *   total failure.
 */
async function chargeWithFailover(txn, { amount, currency }) {
  const { gatewayId: primaryId, strategy } = await routingService.selectGateway();
  const secondaryId = otherGateway(primaryId);
  const primaryLabel = getGateway(primaryId).label;

  await transactionService.logOrchestrationEvent(
    txn.id, txn.status, `Routing decision: ${primaryLabel} selected (${strategy} strategy)`
  );

  const order = [primaryId, secondaryId];
  let lastErr;

  for (let i = 0; i < order.length; i++) {
    const gatewayId = order[i];
    try {
      const result = await attemptGateway(gatewayId, txn, { amount, currency });
      if (i > 0) {
        await transactionService.logOrchestrationEvent(
          txn.id, txn.status,
          `Failover succeeded: ${getGateway(gatewayId).label} processed the payment after ${getGateway(order[0]).label} failed`
        );
      }
      return { gatewayReference: result.gatewayReference, gatewayUsed: gatewayId };
    } catch (err) {
      lastErr = err;
      lastErr.lastGatewayId = gatewayId;

      // Business declines (insufficient funds, etc.) aren't a gateway
      // health problem -- retrying on a different gateway wouldn't
      // change the outcome, so fail immediately without failing over.
      if (!err.retryable) {
        throw lastErr;
      }

      const nextGatewayId = order[i + 1];
      if (nextGatewayId) {
        await transactionService.logOrchestrationEvent(
          txn.id, txn.status,
          `Failover triggered: ${getGateway(gatewayId).label} exhausted retries, switching to ${getGateway(nextGatewayId).label}`
        );
      }
    }
  }

  throw lastErr;
}

module.exports = { chargeWithFailover, MAX_ATTEMPTS_PER_GATEWAY };
