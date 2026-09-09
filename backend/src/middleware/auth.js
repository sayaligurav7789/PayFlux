const { pool } = require('../config/db');

/**
 * Looks up the merchant by their API key (sent as `X-API-Key` header)
 * and attaches it to req.merchant for downstream handlers. Kept simple
 * on purpose -- this is a personal project's auth layer, not production
 * key management (no hashing/rotation here; add that if you productionize this).
 */
async function requireApiKey(req, res, next) {
  const apiKey = req.header('X-API-Key');
  if (!apiKey) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  try {
    const { rows } = await pool.query(`SELECT * FROM merchants WHERE api_key = $1`, [apiKey]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    req.merchant = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireApiKey };
