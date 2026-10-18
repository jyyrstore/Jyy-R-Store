const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const service = fs.readFileSync(
  path.join(__dirname, '../../src/services/payment/payment.service.js'),
  'utf8'
);

const statusStart = service.indexOf('async function reconcileBuatQrisStatus');
const statusEnd = service.indexOf('\n\nasync function reconcilePendingBuatQris', statusStart);
const statusReconcile = service.slice(statusStart, statusEnd);

const start = service.indexOf('async function reconcilePendingBuatQris');
const end = service.indexOf('\n\nasync function recordWebhookEvent', start);
const reconcile = service.slice(start, end);

test('legacy BuatQris expiry without timezone is interpreted as Jakarta time', () => {
  assert.match(reconcile, /raw_reference->>'expired_at'/);
  assert.match(reconcile, /at time zone 'Asia\/Jakarta'/i);
  assert.match(reconcile, /pg_input_is_valid/);
});

test('provider expiry with explicit timezone is parsed as timestamptz', () => {
  assert.match(
    reconcile,
    /raw_reference->>'expired_at'[\s\S]*?timestamp with time zone[\s\S]*?::timestamptz/
  );
});

test('pending payments are checked again when their last check is stale', () => {
  assert.match(reconcile, /last_status_check_at is null/i);
  assert.match(
    reconcile,
    /last_status_check_at <=\s*statement_timestamp\(\) - interval '4 minutes'/i
  );
  assert.match(reconcile, /order by\s+last_status_check_at asc nulls first/i);
});

test('candidate query preserves the provider reference filter and batch limit', () => {
  assert.match(reconcile, /status = 'PENDING'/);
  assert.match(reconcile, /lower\(provider\) = 'buatqris'/);
  assert.match(reconcile, /reference is not null/);
  assert.match(reconcile, /limit \$1/);
});

test('BuatQris fallback uses one hour when provider expiry is invalid or absent', () => {
  assert.match(
    reconcile,
    /else null[\s\S]*?expires_at,[\s\S]*?created_at \+ interval '60 minutes'/
  );
});


test('invalid status-check timestamps do not break atomic claim', () => {
  assert.match(
    statusReconcile,
    /and case\s+when pg_input_is_valid\([\s\S]*?_buatqrisStatusCheckedAt[\s\S]*?timestamp with time zone[\s\S]*?\)\s+then \(raw_reference->>'_buatqrisStatusCheckedAt'\)::timestamptz[\s\S]*?else true\s+end/i
  );
});
