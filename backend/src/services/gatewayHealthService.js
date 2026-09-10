const { pool } = require('../config/db');
const { GATEWAY_IDS } = require('./gatewayRegistry');

/**
 * Logs one gateway call attempt (success or failure) for health tracking.
 * Every attempt gets a row here, whether it was the first try, a retry,
 * or the failover attempt on the other gateway -- this table is the
 * single source of truth for gateway health, used both by the
 * dashboards and by health-based routing decisions.
 */
async function recordAttempt({ transactionId, gatewayId, outcome, latencyMs, errorReason }) {
  await pool.query(
    `INSERT INTO gateway_attempts (transaction_id, gateway_id, outcome, latency_ms, error_reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [transactionId, gatewayId, outcome, Math.round(latencyMs), errorReason || null]
  );
}

/**
 * Recent-window success rate per gateway, used by health-based routing:
 * a gateway that's currently failing a lot should be routed away from,
 * even if its all-time success rate still looks fine.
 */
async function getRecentHealth(windowSize = 20) {
  const result = {};
  for (const gatewayId of GATEWAY_IDS) {
    const { rows } = await pool.query(
      `SELECT outcome FROM gateway_attempts WHERE gateway_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [gatewayId, windowSize]
    );
    const sampleSize = rows.length;
    const successes = rows.filter((r) => r.outcome === 'success').length;
    result[gatewayId] = {
      sampleSize,
      successRatePercent: sampleSize > 0 ? Number(((successes / sampleSize) * 100).toFixed(2)) : 100,
    };
  }
  return result;
}

/**
 * All-time aggregate stats per gateway (total requests, successes,
 * failures, average latency) plus how many times each gateway triggered
 * a failover -- feeds the Routing page and the System Health page's
 * gateway cards.
 */
async function getFullHealthSnapshot() {
  const { rows } = await pool.query(`
    SELECT
      gateway_id,
      COUNT(*)::int AS total_requests,
      COUNT(*) FILTER (WHERE outcome = 'success')::int AS successes,
      COUNT(*) FILTER (WHERE outcome != 'success')::int AS failures,
      ROUND(AVG(latency_ms))::int AS avg_latency_ms
    FROM gateway_attempts
    GROUP BY gateway_id
  `);

  // A "failover" is a failed attempt on this gateway that belongs to a
  // transaction which also has an attempt on the *other* gateway --
  // i.e. this gateway's failure is what caused the switch.
  const { rows: failoverRows } = await pool.query(`
    SELECT gateway_id, COUNT(*)::int AS count
    FROM gateway_attempts ga
    WHERE outcome != 'success'
      AND EXISTS (
        SELECT 1 FROM gateway_attempts other
        WHERE other.transaction_id = ga.transaction_id
          AND other.gateway_id != ga.gateway_id
      )
    GROUP BY gateway_id
  `);

  const recent = await getRecentHealth();

  const byGateway = {};
  for (const gatewayId of GATEWAY_IDS) {
    const row = rows.find((r) => r.gateway_id === gatewayId);
    const failoverRow = failoverRows.find((r) => r.gateway_id === gatewayId);
    const totalRequests = row ? row.total_requests : 0;
    const successes = row ? row.successes : 0;
    byGateway[gatewayId] = {
      totalRequests,
      successes,
      failures: row ? row.failures : 0,
      successRatePercent: totalRequests > 0 ? Number(((successes / totalRequests) * 100).toFixed(2)) : 100,
      avgLatencyMs: row ? row.avg_latency_ms : 0,
      failoversTriggered: failoverRow ? failoverRow.count : 0,
      recentSuccessRatePercent: recent[gatewayId].successRatePercent,
      recentSampleSize: recent[gatewayId].sampleSize,
    };
  }

  return { gateways: byGateway };
}

module.exports = { recordAttempt, getRecentHealth, getFullHealthSnapshot };
