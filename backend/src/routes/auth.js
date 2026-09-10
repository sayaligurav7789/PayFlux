const express = require('express');
const crypto = require('crypto');
const { pool } = require('../config/db');
const {
  createToken,
  requireUserAuth,
} = require('../middleware/userAuth');

const router = express.Router();

const DEMO_EMAIL = 'admin@payflux.dev';
const DEMO_PASSWORD = 'password123';
const DEMO_NAME = 'Admin';
const DEMO_ROLE = 'Administrator';

const PASSWORD_SALT = 'payflux-demo-salt';

function hashPassword(password) {
  return crypto.scryptSync(
    password,
    PASSWORD_SALT,
    64
  ).toString('hex');
}

function verifyPassword(password, storedHash) {
  const hash = hashPassword(password);

  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}

async function ensureDemoUser() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'Administrator',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const existing = await pool.query(
    `SELECT id, name, email, password_hash, role
     FROM users
     WHERE email = $1`,
    [DEMO_EMAIL]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const passwordHash = hashPassword(DEMO_PASSWORD);

  const result = await pool.query(
    `INSERT INTO users
      (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, password_hash, role`,
    [
      DEMO_NAME,
      DEMO_EMAIL,
      passwordHash,
      DEMO_ROLE,
    ]
  );

  return result.rows[0];
}

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Email and password are required',
      });
    }

    await ensureDemoUser();

    const result = await pool.query(
      `SELECT id, name, email, password_hash, role
       FROM users
       WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const user = result.rows[0];

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    const token = createToken(user);

    return res.json({
      token,
      apiKey: 'dev_test_key_123',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireUserAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'User no longer exists',
      });
    }

    res.json({
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;