/**
 * Central registry of available payment gateways, keyed by id. Routing
 * and orchestration code only ever goes through this map -- they never
 * `require('./mockGateway')` directly -- so adding a Gateway C later is
 * a one-line addition here, not a change scattered across the codebase.
 *
 * Every entry must implement the shared gateway interface:
 *   charge({amount, currency}) => Promise<{gatewayReference}>
 *   setForceFailure(enabled) => Promise<void>
 *   id, label
 */
const gatewayA = require('./mockGateway');
const gatewayB = require('./mockGatewayB');

const GATEWAYS = {
  [gatewayA.id]: gatewayA,
  [gatewayB.id]: gatewayB,
};

const GATEWAY_IDS = Object.keys(GATEWAYS); // ['gateway_a', 'gateway_b']

function getGateway(gatewayId) {
  return GATEWAYS[gatewayId] || null;
}

function otherGateway(gatewayId) {
  return GATEWAY_IDS.find((id) => id !== gatewayId);
}

module.exports = { GATEWAYS, GATEWAY_IDS, getGateway, otherGateway };
