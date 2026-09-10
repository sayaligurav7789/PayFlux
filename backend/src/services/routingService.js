/**
 * Routing engine: decides which gateway a given charge should be
 * attempted on first. This is the "backend makes the actual routing
 * decision" piece -- the frontend Routing page only reads/writes the
 * strategy and weights; it never decides where a payment goes.
 *
 * Config (which strategy is active, and the weights for 'weighted')
 * lives in a single-row Postgres table rather than an env var or
 * per-process memory, so changing it from the dashboard takes effect
 * immediately for all three API instances.
 *
 * Round robin's counter lives in Redis (atomic INCR) for the same
 * reason: a per-process counter would let each of the three instances
 * round-robin independently, which isn't round robin at all once you're
 * behind a load balancer.
 */
const redis = require('../config/redis');
const { pool } = require('../config/db');
const gatewayHealthService = require('./gatewayHealthService');
const { GATEWAY_IDS, otherGateway } = require('./gatewayRegistry');

const ROUND_ROBIN_KEY = 'routing:round_robin:counter';
const STRATEGIES = ['round_robin', 'weighted', 'health_based'];

async function getConfig() {
  const { rows } = await pool.query(`SELECT * FROM routing_config WHERE id = 1`);
  return rows[0] || { strategy: 'round_robin', weight_gateway_a: 50, weight_gateway_b: 50 };
}

async function updateConfig({ strategy, weightGatewayA, weightGatewayB }) {
  const { rows } = await pool.query(
    `UPDATE routing_config
     SET strategy = $1, weight_gateway_a = $2, weight_gateway_b = $3, updated_at = now()
     WHERE id = 1
     RETURNING *`,
    [strategy, weightGatewayA, weightGatewayB]
  );
  return rows[0];
}

async function selectRoundRobin() {
  const counter = await redis.incr(ROUND_ROBIN_KEY);
  return GATEWAY_IDS[counter % GATEWAY_IDS.length];
}

function selectWeighted(weightGatewayA, weightGatewayB) {
  const total = weightGatewayA + weightGatewayB;
  if (total <= 0) return GATEWAY_IDS[0];
  const roll = Math.random() * total;
  return roll < weightGatewayA ? 'gateway_a' : 'gateway_b';
}

async function selectHealthBased() {
  const recent = await gatewayHealthService.getRecentHealth();
  const [a, b] = GATEWAY_IDS;
  const healthA = recent[a];
  const healthB = recent[b];

  // No data yet for either gateway -- nothing to base a decision on,
  // fall back to a coin flip rather than always preferring gateway_a.
  if (healthA.sampleSize === 0 && healthB.sampleSize === 0) {
    return Math.random() < 0.5 ? a : b;
  }
  if (healthA.successRatePercent === healthB.successRatePercent) {
    return Math.random() < 0.5 ? a : b;
  }
  return healthA.successRatePercent > healthB.successRatePercent ? a : b;
}

/**
 * @returns {Promise<{gatewayId: string, strategy: string}>}
 */
async function selectGateway() {
  const config = await getConfig();
  let gatewayId;

  switch (config.strategy) {
    case 'weighted':
      gatewayId = selectWeighted(config.weight_gateway_a, config.weight_gateway_b);
      break;
    case 'health_based':
      gatewayId = await selectHealthBased();
      break;
    case 'round_robin':
    default:
      gatewayId = await selectRoundRobin();
      break;
  }

  return { gatewayId, strategy: config.strategy };
}

module.exports = { getConfig, updateConfig, selectGateway, STRATEGIES, otherGateway };
