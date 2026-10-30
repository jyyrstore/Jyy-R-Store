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

test('history order tab uses the same customer order card structure as orders', () => {
  const history = fs.readFileSync(
    path.join(root, 'views/pages/history.ejs'),
    'utf8'
  );
  const orders = view;
  const styles = fs.readFileSync(
    path.join(root, 'public/css/pages.css'),
    'utf8'
  );

  for (const marker of [
    'class="order-list-main"',
    'class="order-list-copy"',
    'class="order-item-product-image"',
    'o.items?.map(i=>',
    'labelStatus(o.status)',
    'formatIDR(o.total)'
  ]) {
    assert.ok(history.includes(marker), `History harus memiliki ${marker}`);
    assert.ok(orders.includes(marker), `Orders harus memiliki ${marker}`);
  }

  assert.match(
    history,
    /include\('\.\.\/partials\/empty',\{title:'Belum ada pesanan'/
  );

  assert.match(
    styles,
    /body\[data-view="pages\/history"\] \[data-tab="orders"\] \.order-list-main/
  );

  assert.match(
    styles,
    /body\[data-view="pages\/orders"\] \.order-list-main/
  );
});

test('payment status polling reads the persisted status without querying BuatQris', () => {
  assert.match(
    api,
    /payment\.getStatus\(req\.params\.id,req\.user\.id\)/
  );
});

test('request error logs include code and status for webhook diagnosis', () => {
  assert.match(errors, /request_error',\{requestId:req\.id,code,status/);
});
