const SENSITIVE_KEYS = ['password', 'pass', 'token', 'secret', 'apiKey', 'serviceRole', 'authorization', 'cookie'];
function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase())) ? '[REDACTED]' : typeof v === 'object' ? redact(v) : v]));
}
function log(level, message, meta = {}) { console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify({ ts: new Date().toISOString(), level, message, ...redact(meta) })); }
module.exports = { log, redact };
