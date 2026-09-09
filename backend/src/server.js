require('dotenv').config();
const { createApp } = require('./app');
const { pool } = require('./config/db');
const redis = require('./config/redis');

const app = createApp();
const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Payment orchestration API listening on port ${PORT}`);
});

// Graceful shutdown: stop accepting new connections, finish in-flight
// requests, then close DB/Redis cleanly. Matters more once you add a
// queue worker in the same process, but good practice regardless.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    redis.disconnect();
    console.log('Shutdown complete.');
    process.exit(0);
  });

  // Force-exit if graceful shutdown hangs
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
