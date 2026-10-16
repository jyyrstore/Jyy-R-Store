const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('early BuatQris webhook returns HTTP 503 for provider retry', () => {
  const routes = fs.readFileSync(
    path.join(root, 'src/routes/index.js'),
    'utf8'
  );

  assert.match(routes, /out\?\.retry\s*===\s*true/);
  assert.match(
    routes,
    /out\?\.reason\s*===\s*'PAYMENT_REFERENCE_NOT_READY'/
  );
  assert.match(routes, /res\.status\(503\)\.json/);
  assert.match(routes, /return ok\(res,out\)/);
});
