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

test('history, orders, and dashboard render one card per order item', () => {
  const history = fs.readFileSync(
    path.join(root, 'views/pages/history.ejs'),
    'utf8'
  );
  const dashboard = fs.readFileSync(
    path.join(root, 'views/pages/dashboard.ejs'),
    'utf8'
  );
  const orders = view;
  const styles = fs.readFileSync(
    path.join(root, 'public/css/pages.css'),
    'utf8'
  );
  const responsive = fs.readFileSync(
    path.join(root, 'public/css/responsive.css'),
    'utf8'
  );

  for (const [name, page] of [
    ['History', history],
    ['Orders', orders],
    ['Dashboard', dashboard]
  ]) {
    for (const marker of [
      'orders.forEach(o=>{',
      'class="list-card"',
      'class="order-list-main"',
      'class="order-list-copy"',
      'class="order-item-product-image"',
      'o.variant_id ? (o.variant_label || o.product_name) : o.product_name',
      'o.variant_icon_path || o.product_thumbnail_path',
      'formatIDR(o.line_total)',
      'labelStatus(o.status)'
    ]) {
      assert.ok(page.includes(marker), `${name} harus memiliki ${marker}`);
    }

    assert.ok(
      !page.includes('o.items?.map(i=>'),
      `${name} tidak boleh menggabungkan semua nama item menjadi satu teks.`
    );
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

  assert.match(
    styles,
    /body\[data-view="pages\/dashboard"\] \.dashboard-order-list \.order-list-main/
  );

  assert.doesNotMatch(
    responsive,
    /body\[data-view="pages\/dashboard"\] \.two-column\.section \.dashboard-balance-list/,
    'Aktivitas saldo harus mengikuti ukuran kartu Pesanan terbaru.'
  );
});


test('customer order pages paginate five product cards globally', () => {
  const repository = fs.readFileSync(
    path.join(root, 'src/repositories/orders.repository.js'),
    'utf8'
  );
  const service = fs.readFileSync(
    path.join(root, 'src/services/order/order.service.js'),
    'utf8'
  );
  const controller = fs.readFileSync(
    path.join(root, 'src/controllers/page.controller.js'),
    'utf8'
  );
  const dashboard = fs.readFileSync(
    path.join(root, 'views/pages/dashboard.ejs'),
    'utf8'
  );
  const history = fs.readFileSync(
    path.join(root, 'views/pages/history.ejs'),
    'utf8'
  );
  const orders = fs.readFileSync(
    path.join(root, 'views/pages/orders.ejs'),
    'utf8'
  );

  assert.match(repository, /async function listItemsForUser/);
  assert.match(repository, /async function countItemsForUser/);
  assert.match(repository, /row_number\(\) over/);
  assert.match(repository, /limit \$2 offset \$3/);
  assert.match(service, /getUserOrderItems/);

  assert.equal(
    (controller.match(/orderService\.getUserOrderItems\(/g) || []).length,
    3
  );
  assert.equal(
    (controller.match(/countItemsForUser\(req\.user\.id\)/g) || []).length,
    3
  );

  for (const [name, page] of [
    ['Dashboard', dashboard],
    ['History', history],
    ['Orders', orders]
  ]) {
    assert.match(
      page,
      /orders\.forEach\(o=>\{/,
      `${name} harus merender baris item pesanan secara langsung.`
    );
    assert.doesNotMatch(
      page,
      /o\.items\?\./,
      `${name} tidak boleh mengulang array items yang sudah dikelompokkan.`
    );
    assert.match(
      page,
      /pagination:ordersPagination/,
      `${name} harus memiliki satu pagination global.`
    );
  }

  assert.match(dashboard, /param:'page'/);
  assert.match(history, /param:'ordersPage'/);
  assert.match(orders, /param:'page'/);
  assert.match(orders, /o\.is_first_order_item/);
});


test('transaction references truncate and copy full IDs', () => {
  const dashboard = fs.readFileSync(
    path.join(root, 'views/pages/dashboard.ejs'),
    'utf8'
  );
  const history = fs.readFileSync(
    path.join(root, 'views/pages/history.ejs'),
    'utf8'
  );
  const deposit = fs.readFileSync(
    path.join(root, 'views/pages/deposit.ejs'),
    'utf8'
  );
  const styles = fs.readFileSync(
    path.join(root, 'public/css/pages.css'),
    'utf8'
  );
  const pagesJs = fs.readFileSync(
    path.join(root, 'public/js/pages.js'),
    'utf8'
  );

  for (const [name, page] of [
    ['Dashboard', dashboard],
    ['History', history],
    ['Deposit', deposit]
  ]) {
    assert.match(
      page,
      /data-history-reference-copy/,
      `${name} harus memakai handler copy reference yang canonical.`
    );
  }

  assert.match(
    dashboard,
    /data-copy-value="<%= m\.reference \|\| '' %>"/
  );
  assert.match(
    history,
    /data-copy-value="<%= m\.reference \|\| '' %>"/
  );
  assert.match(
    deposit,
    /data-copy-value="<%= d\.reference \|\| d\.id \|\| '' %>"/
  );

  assert.ok(
    dashboard.includes(
      "String(m.reference || '—').length > 27 ? String(m.reference).slice(0, 27) + '...'"
    ),
    'Dashboard harus memotong tampilan reference setelah 27 karakter.'
  );
  assert.ok(
    history.includes(
      "String(m.reference || '—').length > 27 ? String(m.reference).slice(0, 27) + '...'"
    ),
    'History harus memotong tampilan reference setelah 27 karakter.'
  );
  assert.ok(
    deposit.includes(
      "String(d.reference || d.id || '—').length > 27 ? String(d.reference || d.id).slice(0, 27) + '...'"
    ),
    'Deposit harus memotong tampilan reference setelah 27 karakter.'
  );

  assert.ok(
    styles.includes(
      'body[data-view="pages/dashboard"] .dashboard-balance-list .history-mutation-reference-copy'
    ),
    'Dashboard harus memakai styling tombol reference existing.'
  );

  assert.match(
    pagesJs,
    /closest\('\[data-history-reference-copy\]'\)/
  );
  assert.ok(
    pagesJs.includes("if (navigator.clipboard?.writeText)") &&
    pagesJs.includes("await navigator.clipboard.writeText(value);"),
    'Handler harus memeriksa dukungan Clipboard API lalu menyalin ID lengkap.'
  );
});

test('order detail orders content, Produk Digital, and payment cards', () => {
  const orderDetail = fs.readFileSync(
    path.join(root, 'views/pages/order-detail.ejs'),
    'utf8'
  );

  const successMessageIndex = orderDetail.indexOf('class="order-success-message"');
  const contentCardIndex = orderDetail.indexOf('class="content-card"');
  const productSummaryIndex = orderDetail.indexOf(
    '<div class="panel order-detail-table-card">'
  );
  const paymentDetailsIndex = orderDetail.indexOf(
    '<div class="payment-details-shell">'
  );

  assert.ok(
    successMessageIndex !== -1 &&
    successMessageIndex < contentCardIndex &&
    contentCardIndex !== -1 &&
    productSummaryIndex !== -1 &&
    paymentDetailsIndex !== -1 &&
    contentCardIndex < productSummaryIndex &&
    productSummaryIndex < paymentDetailsIndex,
    'Urutan kartu harus konten, Produk Digital, lalu Rincian Pembayaran.'
  );
  assert.ok(
    orderDetail.includes('ORDER SUCCEED ✓') &&
    orderDetail.includes('Terima kasih atas kepercayaanmu. Semoga produk yang kamu beli bermanfaat dan memberikan pengalaman terbaik.'),
    'Greeting pembeli harus menggunakan teks yang ditentukan.'
  );

  const registeredIcons = require('../../src/utils/icons').icons;
  assert.ok(
    registeredIcons['shop-twotone'] &&
    orderDetail.includes("icon('shop-twotone')"),
    'Greeting harus menggunakan ikon toko yang sama dengan navigasi /store.'
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
