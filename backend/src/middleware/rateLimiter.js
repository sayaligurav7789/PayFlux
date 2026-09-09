const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

/**
 * 100 requests/min per merchant, backed by Redis so the limit is
 * consistent even if you run multiple API instances behind a load
 * balancer -- an in-memory store would let each instance give out its
 * own 100/min, defeating the point.
 */
const merchantRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.merchant?.id || req.ip,
  store: new RedisStore({
    sendCommand: (...args) => redis.call(...args),
  }),
  message: { error: 'Rate limit exceeded, try again shortly' },
});

module.exports = { merchantRateLimiter };
