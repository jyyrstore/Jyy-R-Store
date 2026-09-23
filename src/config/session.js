const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { db } = require('./database');
const { loadEnv } = require('./env');
function createSessionMiddleware() {
  const env = loadEnv();
  if (!env.SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required before session middleware can be initialized.');
  }

  const base = { secret: env.SESSION_SECRET, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 } };
  if (!env.DATABASE_URL) return session(base);
  const PgStore = connectPgSimple(session);
  return session({ ...base, store: new PgStore({ pool: db(), tableName: 'user_sessions', createTableIfMissing: true }) });
}
module.exports = { createSessionMiddleware };
