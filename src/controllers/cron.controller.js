const crypto = require('crypto');
const { loadEnv } = require('../config/env');

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireCronSecret(req, res, next) {
  const secret = String(loadEnv().CRON_SECRET || '');
  if (!secret) {
    return res.status(503).json({
      success: false,
      error: { code: 'CRON_SECRET_NOT_CONFIGURED', message: 'Cron endpoint is not configured.' }
    });
  }

  const authorization = String(req.get('authorization') || '');
  const bearer = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const supplied = bearer || String(req.get('x-cron-secret') || '');

  if (!safeEqual(supplied, secret)) {
    return res.status(401).json({
      success: false,
      error: { code: 'CRON_UNAUTHORIZED', message: 'Cron authorization is invalid.' }
    });
  }

  return next();
}

async function expire(req, res) {
  const paymentExpiration = require('../jobs/payment-expiration.job');
  const depositExpiration = require('../jobs/deposit-expiration.job');

  const [payments, deposits] = await Promise.all([
    paymentExpiration.run(),
    depositExpiration.run()
  ]);

  return res.json({
    success: true,
    payments,
    deposits,
    requestId: req.id
  });
}

module.exports = { requireCronSecret, expire };
