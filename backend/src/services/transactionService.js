const { withTransaction, pool } = require('../config/db');
const { transition, InvalidTransitionError } = require('./stateMachine');

class DuplicateIdempotencyKeyError extends Error {
  constructor() {
    super('A transaction with this idempotency key already exists');
    this.name = 'DuplicateIdempotencyKeyError';
    this.statusCode = 409;
  }
}

/**
 * Creates a transaction row and its initial "initiated" event atomically.
 * Relies on the DB unique constraint (merchant_id, idempotency_key) as
 * the final backstop against duplicate inserts — Postgres error code
 * 23505 means "someone already created this exact transaction."
 */
async function createTransaction({ merchantId, idempotencyKey, amount, currency }) {
  try {
    return await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO transactions (merchant_id, idempotency_key, amount, currency, status)
         VALUES ($1, $2, $3, $4, 'initiated')
         RETURNING *`,
        [merchantId, idempotencyKey, amount, currency]
      );
      const txn = rows[0];

      await client.query(
        `INSERT INTO transaction_events (transaction_id, from_status, to_status, reason)
         VALUES ($1, NULL, 'initiated', 'transaction_created')`,
        [txn.id]
      );

      return txn;
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new DuplicateIdempotencyKeyError();
    }
    throw err;
  }
}

/**
 * Applies a state machine event to a transaction, writing the new status
 * and the audit event in the same DB transaction so they can never
 * disagree with each other.
 */
async function applyEvent(transactionId, event, reason = null) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM transactions WHERE id = $1 FOR UPDATE`, // row lock: no concurrent transition on the same txn
      [transactionId]
    );
    if (rows.length === 0) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      throw err;
    }
    const txn = rows[0];

    // Throws InvalidTransitionError if this isn't a legal move
    const nextStatus = transition(txn.status, event);

    const { rows: updatedRows } = await client.query(
      `UPDATE transactions SET status = $1 WHERE id = $2 RETURNING *`,
      [nextStatus, transactionId]
    );

    await client.query(
      `INSERT INTO transaction_events (transaction_id, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4)`,
      [transactionId, txn.status, nextStatus, reason]
    );

    return updatedRows[0];
  });
}

async function incrementRetryCount(transactionId) {
  await pool.query(
    `UPDATE transactions SET retry_count = retry_count + 1 WHERE id = $1`,
    [transactionId]
  );
}

/**
 * Writes an audit-only row to transaction_events for something that
 * happened during gateway processing (an attempt, a retry, a failover)
 * without actually changing the transaction's status -- from_status and
 * to_status are both set to the status the transaction is already in.
 *
 * This deliberately bypasses the guarded transition() in stateMachine.js:
 * "gateway_a attempt 2 failed" isn't a state transition, it's a note in
 * the same audit trail. Reusing transaction_events (rather than a new
 * table) means the existing GET /transactions/:id/events endpoint and
 * the dashboard's timeline view show retries and failovers for free.
 */
async function logOrchestrationEvent(transactionId, status, reason) {
  await pool.query(
    `INSERT INTO transaction_events (transaction_id, from_status, to_status, reason)
     VALUES ($1, $2, $2, $3)`,
    [transactionId, status, reason]
  );
}

class RefundExceedsBalanceError extends Error {
  constructor(remaining) {
    super(`Refund amount exceeds the remaining refundable balance (${remaining})`);
    this.name = 'RefundExceedsBalanceError';
    this.statusCode = 400;
  }
}

class InvalidRefundAmountError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidRefundAmountError';
    this.statusCode = 400;
  }
}

/**
 * Processes a (full or partial) refund atomically: locks the row,
 * validates the amount against what's left to refund, decides whether
 * this refund fully settles the balance (-> 'refunded') or leaves some
 * remaining (-> 'partially_refunded'), and writes the new refunded_amount
 * + status + audit event all in one DB transaction.
 *
 * @param {string} transactionId
 * @param {number|undefined} amount - amount to refund, in the smallest
 *   currency unit. Omitted/undefined means "refund whatever remains".
 * @param {string} reason
 */
async function refundTransaction(transactionId, amount, reason = 'merchant_requested') {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM transactions WHERE id = $1 FOR UPDATE`,
      [transactionId]
    );
    if (rows.length === 0) {
      const err = new Error('Transaction not found');
      err.statusCode = 404;
      throw err;
    }
    const txn = rows[0];
    const remaining = Number(txn.amount) - Number(txn.refunded_amount);

    const refundAmount = amount == null ? remaining : Number(amount);
    if (!Number.isInteger(refundAmount) || refundAmount <= 0) {
      throw new InvalidRefundAmountError('Refund amount must be a positive integer (smallest currency unit)');
    }
    if (refundAmount > remaining) {
      throw new RefundExceedsBalanceError(remaining);
    }

    const event = refundAmount === remaining ? 'refund' : 'partialRefund';
    const nextStatus = transition(txn.status, event); // throws InvalidTransitionError if not success/partially_refunded

    const newRefundedAmount = Number(txn.refunded_amount) + refundAmount;
    const { rows: updatedRows } = await client.query(
      `UPDATE transactions SET status = $1, refunded_amount = $2 WHERE id = $3 RETURNING *`,
      [nextStatus, newRefundedAmount, transactionId]
    );

    await client.query(
      `INSERT INTO transaction_events (transaction_id, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4)`,
      [
        transactionId,
        txn.status,
        nextStatus,
        `${event === 'refund' ? 'Full' : 'Partial'} refund of ${refundAmount} (${reason}); ` +
          `remaining refundable balance: ${Number(txn.amount) - newRefundedAmount}`,
      ]
    );

    return updatedRows[0];
  });
}

async function getTransaction(id) {
  const { rows } = await pool.query(`SELECT * FROM transactions WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function listTransactions({ merchantId, status, search, limit = 50, offset = 0 }) {
  const params = [merchantId];
  let where = 'merchant_id = $1';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (id::text ILIKE $${params.length} OR idempotency_key ILIKE $${params.length})`;
  }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM transactions WHERE ${where}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) FROM transactions WHERE ${where}`,
    params.slice(0, params.length - 2)
  );

  return { rows, total: Number(countRows[0].count) };
}

async function getEvents(transactionId) {
  const { rows } = await pool.query(
    `SELECT * FROM transaction_events WHERE transaction_id = $1 ORDER BY created_at ASC`,
    [transactionId]
  );
  return rows;
}

async function getAnalytics(merchantId) {
  const { rows: statusCounts } = await pool.query(
    `SELECT status, COUNT(*) as count FROM transactions WHERE merchant_id = $1 GROUP BY status`,
    [merchantId]
  );

  const { rows: dailyVolume } = await pool.query(
    `SELECT date_trunc('day', created_at) as day, COUNT(*) as count
     FROM transactions
     WHERE merchant_id = $1 AND created_at > now() - interval '14 days'
     GROUP BY day ORDER BY day ASC`,
    [merchantId]
  );

  return {
    statusCounts: statusCounts.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {}),
    dailyVolume: dailyVolume.map((r) => ({ day: r.day, count: Number(r.count) })),
  };
}

module.exports = {
  createTransaction, applyEvent, incrementRetryCount, getTransaction,
  listTransactions, getEvents, getAnalytics, DuplicateIdempotencyKeyError,
  logOrchestrationEvent, refundTransaction,
  RefundExceedsBalanceError, InvalidRefundAmountError,
};
