const { Pool } = require('pg');
const { URL } = require('url');

let pool;
let initPromise;

function isVercelRuntime() {
  return Boolean(process.env.VERCEL);
}

function isSupabaseSharedPooler(url) {
  return /(^|\.)pooler\.supabase\.com$/i.test(url.hostname);
}

function normalizeConnectionString(env) {
  const raw = String(env.DATABASE_URL || '').trim();
  if (!raw) return raw;

  const mode = String(process.env.DATABASE_POOL_MODE || 'auto').trim().toLowerCase();
  if (!isVercelRuntime() || mode === 'session') return raw;

  try {
    const url = new URL(raw);

    if (
      isSupabaseSharedPooler(url) &&
      (mode === 'auto' || mode === 'transaction') &&
      (url.port === '' || url.port === '5432')
    ) {
      url.port = '6543';
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function poolMax() {
  const configured = Number(process.env.DATABASE_POOL_MAX);

  if (
    Number.isSafeInteger(configured) &&
    configured >= 1 &&
    configured <= 5
  ) {
    return configured;
  }

  return isVercelRuntime() ? 1 : 5;
}

function createPool(env) {
  return new Pool({
    connectionString: normalizeConnectionString(env),
    max: poolMax(),
    idleTimeoutMillis: isVercelRuntime() ? 5000 : 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    ssl: env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined
  });
}

async function initDatabase(env) {
  if (!env.DATABASE_URL) return;
  if (pool) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const candidate = createPool(env);

    try {
      await candidate.query('select 1');
      pool = candidate;
    } catch (error) {
      await candidate.end().catch(() => {});
      throw error;
    }
  })();

  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

function db() {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  return pool;
}

async function query(text, params) {
  return db().query(text, params);
}

async function withTransaction(fn) {
  const client = await db().connect();

  try {
    await client.query('begin');

    const result = await fn(client);

    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function closeDatabase() {
  const current = pool;
  pool = null;

  if (current) {
    await current.end();
  }
}

module.exports = {
  initDatabase,
  db,
  query,
  withTransaction,
  closeDatabase
};
