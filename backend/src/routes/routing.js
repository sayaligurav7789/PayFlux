const express = require('express');
const router = express.Router();

const routingService = require('../services/routingService');
const gatewayHealthService = require('../services/gatewayHealthService');
const { getGateway, GATEWAY_IDS } = require('../services/gatewayRegistry');

/** GET /routing/config -- current strategy + weights. Feeds the Routing page. */
router.get('/config', async (req, res, next) => {
  try {
    const config = await routingService.getConfig();
    res.json({
      strategy: config.strategy,
      weights: { gateway_a: config.weight_gateway_a, gateway_b: config.weight_gateway_b },
    });
  } catch (err) {
    next(err);
  }
});

/** PUT /routing/config -- change strategy/weights. Takes effect immediately, for every API instance. */
router.put('/config', async (req, res, next) => {
  try {
    const { strategy, weightGatewayA, weightGatewayB } = req.body;

    if (!routingService.STRATEGIES.includes(strategy)) {
      return res.status(400).json({ error: `strategy must be one of: ${routingService.STRATEGIES.join(', ')}` });
    }

    const weightA = weightGatewayA == null ? 50 : Number(weightGatewayA);
    const weightB = weightGatewayB == null ? 50 : Number(weightGatewayB);
    if (!Number.isFinite(weightA) || !Number.isFinite(weightB) || weightA < 0 || weightB < 0 || weightA + weightB === 0) {
      return res.status(400).json({ error: 'weights must be non-negative numbers that sum to more than zero' });
    }

    const config = await routingService.updateConfig({ strategy, weightGatewayA: weightA, weightGatewayB: weightB });
    res.json({
      strategy: config.strategy,
      weights: { gateway_a: config.weight_gateway_a, gateway_b: config.weight_gateway_b },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /routing/health -- per-gateway success rate, failures, latency, requests, failovers. */
router.get('/health', async (req, res, next) => {
  try {
    const snapshot = await gatewayHealthService.getFullHealthSnapshot();
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /routing/simulate/:gatewayId/force-failure
 * Demo/testing helper: forces a gateway to always fail so the
 * "Gateway A fails -> retries -> fails over to Gateway B" flow can be
 * demoed and tested deterministically instead of waiting on a random
 * failure roll. Not used in normal operation.
 */
router.post('/simulate/:gatewayId/force-failure', async (req, res, next) => {
  try {
    const { gatewayId } = req.params;
    if (!GATEWAY_IDS.includes(gatewayId)) {
      return res.status(404).json({ error: `Unknown gateway "${gatewayId}"` });
    }
    const enabled = !!req.body.enabled;
    await getGateway(gatewayId).setForceFailure(enabled);
    res.json({ gatewayId, forceFailure: enabled });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
