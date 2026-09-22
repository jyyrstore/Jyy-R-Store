const { Pool } = require('pg');
let pool;
async function initDatabase(env) {
  if (!env.DATABASE_URL) return;
  pool = new Pool({ connectionString: env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000, ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
  await pool.query('select 1');
}
function db() { if (!pool) throw new Error('Database is not configured.'); return pool; }
async function query(text, params) { return db().query(text, params); }
async function withTransaction(fn) {
  const client = await db().connect();
  try { await client.query('begin'); const result = await fn(client); await client.query('commit'); return result; }
  catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); }
}
async function closeDatabase() { if (pool) await pool.end(); }
module.exports = { initDatabase, db, query, withTransaction, closeDatabase };
