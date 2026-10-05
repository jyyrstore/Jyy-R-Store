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
    /createForOrder\(req\.user\.id,created\.order,reviewReturnUrl\)/
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
