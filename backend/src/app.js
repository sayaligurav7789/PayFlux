const express = require('express');
const pinoHttp = require('pino-http');

const { requireApiKey } = require('./middleware/auth');
const { merchantRateLimiter } = require('./middleware/rateLimiter');
const transactionsRouter = require('./routes/transactions');
const webhooksRouter = require('./routes/webhooks');
const mockMerchantRouter = require('./routes/mockMerchant');
const routingRouter = require('./routes/routing');
const { InvalidTransitionError } = require('./services/stateMachine');
const { metricsMiddleware, getSnapshot } = require('./middleware/metrics');
const authRoutes = require('./routes/auth');

function createApp() {
  const app = express();

  app.use(express.json());

  app.use('/auth', authRoutes);
  app.use(metricsMiddleware);
  app.use(pinoHttp({ level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' }));

  // CORS only for health/metrics endpoints -- the dashboard calls these
  // directly on each instance's own port (4001/4002/4003), not through
  // the Vite proxy, so this needs to be cross-origin. No sensitive data
  // here, so opening it is safe.
  app.use(['/health', '/metrics'], (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', instance: process.env.INSTANCE_ID || 'unknown' });
  });

  // Deep check: actually pings Postgres and Redis, not just "the process is alive."
  app.get('/health/deep', async (req, res) => {
    const instance = process.env.INSTANCE_ID || 'unknown';
    const result = { instance, postgres: { ok: false }, redis: { ok: false } };

    try {
      const { pool } = require('./config/db');
      const start = Date.now();
      await pool.query('SELECT 1');
      result.postgres = { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      result.postgres = { ok: false, error: err.message };
    }

    try {
      const redis = require('./config/redis');
      const start = Date.now();
      await redis.ping();
      result.redis = { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      result.redis = { ok: false, error: err.message };
    }

    const allOk = result.postgres.ok && result.redis.ok;
    res.status(allOk ? 200 : 503).json(result);
  });

  app.get('/metrics', (req, res) => {
    res.json(getSnapshot());
  });

  // Mock merchant receiver -- no auth, this simulates an external server
  app.use('/mock-merchant', mockMerchantRouter);

  // Everything under /transactions requires a merchant API key + is rate limited
  app.use('/transactions', requireApiKey, merchantRateLimiter, transactionsRouter);

  app.use('/webhooks', requireApiKey, merchantRateLimiter, webhooksRouter);

  app.use('/routing', requireApiKey, merchantRateLimiter, routingRouter);

  // Centralized error handler
  app.use((err, req, res, next) => {
    if (err instanceof InvalidTransitionError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    req.log?.error(err);
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };