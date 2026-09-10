const express = require('express');
const router = express.Router();

const idempotencyService = require('../services/idempotencyService');
const transactionService = require('../services/transactionService');
const webhookService = require('../services/webhookService');
const paymentOrchestrationService = require('../services/paymentOrchestrationService');
const { isTerminal } = require('../services/stateMachine');

/**
 * POST /transactions
 *
 * The idempotency flow, step by step:
 *   1. Acquire the Redis lock for this (merchant, idempotency_key) pair.
 *      - "in_progress"  -> another identical request is mid-flight -> 409
 *      - "cached"       -> this exact request already completed -> return
 *                          the stored response, no reprocessing
 *      - "acquired"     -> we're clear to process
 *   2. Insert the transaction row. The Postgres UNIQUE constraint is the
 *      backstop here -- if Redis somehow let a duplicate through, this
 *      insert throws and we treat it as already-processed.
 *   3. Move initiated -> pending, then attempt the charge via the
 *      routing engine: it picks a gateway (round robin / weighted /
 *      health-based), retries with backoff, and automatically fails
 *      over to the other gateway if the first one keeps failing.
 *   4. On terminal state, fire a webhook (fire-and-forget from the
 *      caller's perspective -- doesn't block the response).
 *   5. Cache the final response against the idempotency key.
 */
router.post('/', async (req, res, next) => {
  const idempotencyKey = req.header('Idempotency-Key');
  const { amount, currency = 'INR' } = req.body;

  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency-Key header is required' });
  }
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount must be a positive integer (smallest currency unit)' });
  }

  const merchant = req.merchant;
  const lockResult = await idempotencyService.acquireLock(merchant.id, idempotencyKey);

  if (lockResult.state === 'in_progress') {
    return res.status(409).json({ error: 'A request with this idempotency key is already being processed' });
  }
  if (lockResult.state === 'cached') {
    return res.status(200).json(lockResult.response);
  }

  try {
    // Step 2: create the row (DB unique constraint is the real backstop)
    let txn;
    try {
      txn = await transactionService.createTransaction({
        merchantId: merchant.id,
        idempotencyKey,
        amount,
        currency,
      });
    } catch (err) {
      if (err instanceof transactionService.DuplicateIdempotencyKeyError) {
        // Redis lock missed a race, but Postgres caught it. Fetch and return
        // the existing transaction rather than erroring the client.
        const { rows } = await require('../config/db').pool.query(
          `SELECT * FROM transactions WHERE merchant_id = $1 AND idempotency_key = $2`,
          [merchant.id, idempotencyKey]
        );
        const response = { transaction: rows[0] };
        await idempotencyService.storeResult(merchant.id, idempotencyKey, response);
        return res.status(200).json(response);
      }
      throw err;
    }

    // Step 3: initiated -> pending, then attempt the gateway charge with retries
    txn = await transactionService.applyEvent(txn.id, 'start', 'processing_started');

    try {
      const { gatewayReference, gatewayUsed } = await paymentOrchestrationService.chargeWithFailover(
        txn,
        { amount, currency }
      );

      await require('../config/db').pool.query(
        `UPDATE transactions SET gateway_reference = $1, gateway_used = $2 WHERE id = $3`,
        [gatewayReference, gatewayUsed, txn.id]
      );
      txn = await transactionService.applyEvent(txn.id, 'gatewaySuccess', `Processed via ${gatewayUsed}`);
    } catch (gatewayErr) {
      if (gatewayErr.lastGatewayId) {
        await require('../config/db').pool.query(
          `UPDATE transactions SET gateway_used = $1 WHERE id = $2`,
          [gatewayErr.lastGatewayId, txn.id]
        );
      }
      txn = await transactionService.applyEvent(txn.id, 'gatewayFailure', gatewayErr.message);
    }

    // Step 4: fire webhook on terminal state, don't block the response on it
    if (isTerminal(txn.status)) {
      webhookService.dispatchWebhook({ transaction: txn, merchant }).catch((err) => {
        console.error('Webhook dispatch error:', err.message);
      });
    }

    const response = { transaction: txn };
    // Step 5: cache so retries of this exact request return instantly
    await idempotencyService.storeResult(merchant.id, idempotencyKey, response);

    res.status(201).json(response);
  } catch (err) {
    await idempotencyService.releaseLock(merchant.id, idempotencyKey);
    next(err);
  }
});

/** GET /transactions -- list, filterable by status. Feeds the dashboard list view. */
router.get('/', async (req, res, next) => {
  try {
    const { status, search, limit, offset } = req.query;
    const { rows, total } = await transactionService.listTransactions({
      merchantId: req.merchant.id, status, search,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
    res.json({ transactions: rows, total });
  } catch (err) {
    next(err);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const analytics = await transactionService.getAnalytics(req.merchant.id);
    res.json(analytics);
  } catch (err) {
    next(err);
  }
});

/** GET /transactions/:id -- current state */
router.get('/:id', async (req, res, next) => {
  try {
    const txn = await transactionService.getTransaction(req.params.id);
    if (!txn || txn.merchant_id !== req.merchant.id) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ transaction: txn });
  } catch (err) {
    next(err);
  }
});

/** GET /transactions/:id/events -- full audit trail. Feeds the dashboard timeline view. */
router.get('/:id/events', async (req, res, next) => {
  try {
    const txn = await transactionService.getTransaction(req.params.id);
    if (!txn || txn.merchant_id !== req.merchant.id) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const events = await transactionService.getEvents(req.params.id);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

/** GET /transactions/:id/webhooks -- delivery log. Feeds the dashboard webhook view. */
router.get('/:id/webhooks', async (req, res, next) => {
  try {
    const txn = await transactionService.getTransaction(req.params.id);
    if (!txn || txn.merchant_id !== req.merchant.id) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const webhookService = require('../services/webhookService');
    const webhooks = await webhookService.getWebhooksForTransaction(req.params.id);
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

/** POST /transactions/:id/refund -- amount is optional; omitted means "refund what's left". */
router.post('/:id/refund', async (req, res, next) => {
  try {
    const txn = await transactionService.getTransaction(req.params.id);
    if (!txn || txn.merchant_id !== req.merchant.id) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    const { amount, reason } = req.body;
    const updated = await transactionService.refundTransaction(
      req.params.id,
      amount,
      reason || 'merchant_requested'
    );
    res.json({ transaction: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
