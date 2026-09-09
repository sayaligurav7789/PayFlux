const express = require('express');
const router = express.Router();
const { verifySignature } = require('../services/webhookService');

/**
 * Stands in for "the merchant's server" -- proves you understand the
 * receiving side of webhook security, not just sending. In a real
 * integration this endpoint would live on the merchant's infrastructure,
 * not yours.
 */
router.post('/webhook', express.json(), async (req, res) => {
  const signature = req.header('X-Signature');
  // NOTE: hardcoded secret here for demo simplicity -- in the real
  // dispatch flow the signature is generated per-merchant from
  // merchants.webhook_secret. This mock receiver only needs to prove
  // verification works, so it re-derives against the same dev secret
  // seeded in the migration.
  const secret = 'dev_webhook_secret_change_me';

  const valid = verifySignature(req.body, signature, secret);

  if (!valid) {
    console.warn('Received webhook with invalid signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  console.log('Received verified webhook:', req.body);
  res.status(200).json({ received: true });
});

module.exports = router;
