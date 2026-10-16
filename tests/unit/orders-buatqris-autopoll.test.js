const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const repo = fs.readFileSync(
  path.join(root, 'src/repositories/orders.repository.js'), 'utf8'
);
const view = fs.readFileSync(
  path.join(root, 'views/pages/orders.ejs'), 'utf8'
);
const api = fs.readFileSync(
  path.join(root, 'src/controllers/api.controller.js'), 'utf8'
);
const errors = fs.readFileSync(
  path.join(root, 'src/middleware/error.middleware.js'), 'utf8'
);

test('orders list exposes the latest pending payment for BuatQris', () => {
  assert.match(repo, /as pending_payment_id/i);
  assert.match(repo, /as pending_payment_provider/i);
  assert.match(repo, /p\.status='PENDING'/i);
});

test('orders page polls pending BuatQris status through the server API', () => {
  assert.match(view, /data-pending-buatqris-payment/);
  assert.ok(
    view.includes("'/api/payment/'+encodeURIComponent(id)"),
    'Polling harus menggunakan endpoint status pembayaran.'
  );
  assert.ok(
    view.includes("timer=setTimeout(()=>{") &&
    view.includes("},delayMs);"),
    'Polling harus menjadwalkan pemeriksaan berikutnya.'
  );
  assert.match(view, /window\.location\.reload\(\)/);
});

test('payment status endpoint retains server-side reconciliation', () => {
  assert.match(
    api,
    /payment\.reconcileBuatQrisStatus\(req\.params\.id,req\.user\.id\)/
  );
});

test('request error logs include code and status for webhook diagnosis', () => {
  assert.match(errors, /request_error',\{requestId:req\.id,code,status/);
});
