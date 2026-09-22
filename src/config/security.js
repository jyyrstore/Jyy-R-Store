const crypto = require('crypto');
const { loadEnv } = require('./env');
function csrfForSession(session) {
  const env = loadEnv();
  if (!session.csrfToken) session.csrfToken = crypto.createHmac('sha256', env.CSRF_SECRET || 'dev-csrf').update(crypto.randomBytes(24)).digest('hex');
  return session.csrfToken;
}
function safeEqual(a, b) {
  if (!a || !b) return false;
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
module.exports = { csrfForSession, safeEqual };
