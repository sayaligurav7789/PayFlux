const crypto = require('crypto');
const { pool } = require('../config/db');
const { retryWithBackoff } = require('../utils/retry');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

/**
 * Verifies an inbound webhook signature. Use this on the receiving side
 * (see routes/mockMerchant.js) to prove you understand both ends of
 * webhook security, not just sending.
 */
function verifySignature(payload, signature, secret) {
  const expected = sign(payload, secret);
  // timingSafeEqual requires equal-length buffers, so guard that first
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Dispatches a webhook for a transaction reaching a terminal state.
 * Logs every attempt to the `webhooks` table so the dashboard's webhook
 * log page has something real to show -- delivery status, attempt count,
 * signature.
 */
async function dispatchWebhook({ transaction, merchant }) {
  const payload = {
    transaction_id: transaction.id,
    status: transaction.status,
    amount: transaction.amount,
    currency: transaction.currency,
    timestamp: new Date().toISOString(),
  };
  const signature = sign(payload, merchant.webhook_secret);
  
  const { rows } = await pool.query(
    `INSERT INTO webhooks (transaction_id, payload, signature, delivery_status, attempt_count)
     VALUES ($1, $2, $3, 'pending', 0) RETURNING *`,
    [transaction.id, payload, signature]
  );
  const webhookRow = rows[0];

  try {
    await retryWithBackoff(
      async () => {
        await pool.query(
          `UPDATE webhooks SET attempt_count = attempt_count + 1, last_attempted_at = now() WHERE id = $1`,
          [webhookRow.id]
        );

        const res = await fetch(merchant.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`Webhook receiver responded ${res.status}`);
        }
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1000,
        isRetryable: () => true, // any delivery failure is worth retrying, unlike gateway calls
      }
    );

    await pool.query(`UPDATE webhooks SET delivery_status = 'delivered' WHERE id = $1`, [webhookRow.id]);
  } catch (err) {
    await pool.query(`UPDATE webhooks SET delivery_status = 'failed' WHERE id = $1`, [webhookRow.id]);
    // Don't rethrow -- a failed webhook shouldn't fail the transaction
    // that triggered it. Log and move on; the delivery log records the failure.
    console.error(`Webhook delivery failed for transaction ${transaction.id}:`, err.message);
  }
}

async function getWebhooksForTransaction(transactionId) {
  const { rows } = await pool.query(
    `SELECT * FROM webhooks WHERE transaction_id = $1 ORDER BY created_at DESC`,
    [transactionId]
  );
  return rows;
}

/**
 * All webhook deliveries for a merchant, across every transaction --
 * feeds the dashboard's webhook log page. Joins through transactions
 * since webhooks itself has no merchant_id column.
 */
async function getWebhooksForMerchant(merchantId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT w.* FROM webhooks w
     JOIN transactions t ON t.id = w.transaction_id
     WHERE t.merchant_id = $1
     ORDER BY w.created_at DESC
     LIMIT $2`,
    [merchantId, limit]
  );
  return rows;
}

module.exports = { sign, verifySignature, dispatchWebhook, getWebhooksForTransaction, getWebhooksForMerchant };
