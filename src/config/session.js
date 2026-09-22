const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { db } = require('./database');
const { loadEnv } = require('./env');
function createSessionMiddleware() {
  const env = loadEnv();
  const base = { secret: env.SESSION_SECRET || 'dev-insecure-session', resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: env.NODE_ENV === 'production', maxAge: 7 * 24 * 60 * 60 * 1000 } };
  if (!env.SESSION_SECRET || !env.DATABASE_URL) return session(base);
  const PgStore = connectPgSimple(session);
  return session({ ...base, store: new PgStore({ pool: db(), tableName: 'user_sessions', createTableIfMissing: true }) });
}
module.exports = { createSessionMiddleware };
