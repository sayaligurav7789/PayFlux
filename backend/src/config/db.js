const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // Idle client errors shouldn't crash the whole process
  console.error('Unexpected Postgres pool error', err);
});

/**
 * Run a callback inside a single DB transaction. Commits on success,
 * rolls back on any thrown error. Use this any time a write needs to be
 * atomic across more than one table — e.g. updating transactions.status
 * AND inserting a transaction_events row together.
 */
async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
