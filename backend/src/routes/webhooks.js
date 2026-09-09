const express = require('express');
const router = express.Router();
const { getWebhooksForMerchant } = require('../services/webhookService');

/** GET /webhooks -- all webhook deliveries for this merchant. Feeds the dashboard webhook log page. */
router.get('/', async (req, res, next) => {
  try {
    const webhooks = await getWebhooksForMerchant(req.merchant.id);
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

module.exports = router;