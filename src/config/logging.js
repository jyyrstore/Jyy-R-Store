const SENSITIVE_KEYS = ['password', 'pass', 'token', 'secret', 'apiKey', 'serviceRole', 'authorization', 'cookie'];
function redact(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s.toLowerCase())) ? '[REDACTED]' : typeof v === 'object' ? redact(v) : v]));
}
function log(level, message, meta = {}) {
  const output = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redact(meta)
  };

  if (
    process.env.NODE_ENV !== 'production' &&
    level === 'info' &&
    message === 'request'
  ) {
    const method = String(output.method || '').padEnd(5);

    const compactPath = String(output.path || '').replace(
      /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\/|$)/gi,
      (_, id) => `/${id.slice(0, 8)}…`
    );

    const requestPath = compactPath.padEnd(30);
    const status = String(output.status ?? '').padStart(3);
    const duration = `${Number(output.durationMs || 0)}ms`;
    const user = output.userId
      ? `user=${String(output.userId).slice(0, 8)}`
      : 'user=guest';

    console.log(
      `[JyyR] ${method} ${requestPath} -> ${status}  ${duration.padStart(7)}  ${user}`
    );

    return;
  }

  console[
    level === 'error'
      ? 'error'
      : level === 'warn'
        ? 'warn'
        : 'log'
  ](
    JSON.stringify(output)
  );
}

module.exports = { log, redact };
