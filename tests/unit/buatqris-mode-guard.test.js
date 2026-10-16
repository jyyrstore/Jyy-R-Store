const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  qrisMethodConflictsWithTestMode
} = require('../../src/config/payment');

const service = fs.readFileSync(
  path.join(__dirname, '../../src/services/payment/payment.service.js'),
  'utf8'
);

test('qris_four does not falsely conflict with Sandbox mode', () => {
  assert.equal(qrisMethodConflictsWithTestMode('qris_four', true), false);
});

test('qris_four is not an environment indicator for Live either', () => {
  assert.equal(qrisMethodConflictsWithTestMode('qris_four', false), false);
});

test('explicit test marker matches Sandbox mode', () => {
  assert.equal(qrisMethodConflictsWithTestMode('test', true), false);
});

test('explicit test marker conflicts with stored Live mode', () => {
  assert.equal(qrisMethodConflictsWithTestMode('test', false), true);
});

test('method marker comparison is trimmed and case-insensitive', () => {
  assert.equal(qrisMethodConflictsWithTestMode(' TEST ', false), true);
});

test('payment reconciliation uses the corrected method guard', () => {
  assert.match(
    service,
    /paymentConfig\.qrisMethodConflictsWithTestMode\(\s*remote\.qris_method,\s*storedIsTest\s*\)/
  );
});
