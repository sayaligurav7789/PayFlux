const crypto = require('crypto');

const AUTH_SECRET =
  process.env.AUTH_SECRET || 'ledger-local-development-secret';

function createToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(payload)
  ).toString('base64url');

  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token) {
  try {
    const [encodedPayload, signature] = token.split('.');

    if (!encodedPayload || !signature) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', AUTH_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    const valid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!valid) {
      return null;
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString()
    );

    if (payload.exp < Date.now()) {
      return null;
    }

    return payload;
  } catch (err) {
    return null;
  }
}

function requireUserAuth(req, res, next) {
  const header = req.header('Authorization');

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Missing authentication token',
    });
  }

  const token = header.substring(7);
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      error: 'Invalid or expired authentication token',
    });
  }

  req.user = user;
  next();
}

module.exports = {
  createToken,
  verifyToken,
  requireUserAuth,
};