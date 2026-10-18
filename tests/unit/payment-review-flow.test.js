const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const path=require('path');

const root=path.join(__dirname,'../..');

function read(file){
  return fs.readFileSync(
    path.join(root,file),
    'utf8'
  );
}

test('post-payment review prompt exists',()=>{
  const pages=read('public/js/pages.js');

  assert.match(
    pages,
    /JYYR POST-PAYMENT REVIEW PROMPT/
  );

  assert.match(
    pages,
    /Pembayaran berhasil ✓/
  );

  assert.match(
    pages,
    /Pembelian berhasil ✓/
  );

  assert.match(
    pages,
    /Bagaimana pengalaman kamu\?/
  );

  assert.match(
    pages,
    /Beri Rating/
  );

  assert.match(
    pages,
    /Nanti saja/
  );

  assert.match(
    pages,
    /\/api\/products\/[\s\S]*\/review/
  );

  assert.match(
    pages,
    /button\.closest\(\s*'\[data-product-review-form\],\[data-payment-review-prompt-form\]'/
  );
});

test('rating comments are optional and blank comments use fallback',()=>{
  const pages=read('public/js/pages.js');

  assert.equal(
    (pages.match(/Tidak Ada Komentar Untuk Pesanan Ini/g)||[]).length,
    2
  );

  assert.match(
    pages,
    /name="comment"\s+rows="4"\s+maxlength="100"\s+placeholder="Ceritakan pengalaman setelah membeli produk ini\.\.\."/
  );

  assert.match(
    pages,
    /placeholder="Ceritakan pengalaman setelah membeli produk ini\.\.\."\s*><\/textarea>/
  );

  assert.doesNotMatch(
    pages,
    /placeholder="Ceritakan pengalaman setelah membeli produk ini\.\.\."\s+required/
  );

  const detail=read('views/pages/order-detail.ejs');

  assert.match(
    detail,
    /name="comment"\s+rows="4"\s+maxlength="100"\s+placeholder="Tulis pengalaman Anda setelah membeli produk ini\.\.\."/
  );

  assert.match(
    detail,
    /aria-label="Komentar ulasan"\s*><%=/
  );
});

test('payment success pages expose the order id to review prompt',()=>{
  const orders=read(
    'views/pages/orders.ejs'
  );

  const detail=read(
    'views/pages/order-detail.ejs'
  );

  assert.match(
    orders,
    /data-payment-review-orders/
  );

  assert.match(
    orders,
    /req\.query\.reviewOrder/
  );

  assert.match(
    detail,
    /data-payment-review-order-detail/
  );

  assert.match(
    detail,
    /req\.query\.review/
  );
});

test('gateway payment callback becomes order-specific',()=>{
  const source=read(
    'src/controllers/api.controller.js'
  );

  assert.match(
    source,
    /reviewReturnUrl/
  );

  assert.match(
    source,
    /searchParams\.set\('reviewOrder',created\.order\.id\)/
  );

  assert.match(
    source,
    /createForOrder\(\s*req\.user\.id,\s*created\.order,\s*reviewReturnUrl,\s*\{paymentMode\}\s*\)/
  );
});

test('Xendit accepts the server-provided HTTPS callback',()=>{
  const source=read(
    'src/config/payment.js'
  );

  assert.match(
    source,
    /normalizeReturnUrl\(value=null\)/
  );

  assert.match(
    source,
    /async createPayment\(\{orderId,amount,customer,idempotencyKey,returnUrl\}\)/
  );

  assert.match(
    source,
    /this\.normalizeReturnUrl\(returnUrl\)/
  );

  assert.match(
    source,
    /success_return_url:callbackReturnUrl/
  );
});

console.log(
  'payment-review-flow.test.js: contract checks loaded'
);
