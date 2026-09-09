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
};
