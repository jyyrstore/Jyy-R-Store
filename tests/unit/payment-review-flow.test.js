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

  const promptStart=pages.indexOf(
    '/* JYYR POST-PAYMENT REVIEW PROMPT */'
  );
  const promptEnd=pages.indexOf(
    '/* shared-card-textarea-auto-resize */',
    promptStart
  );
  assert.ok(promptStart>=0&&promptEnd>promptStart);
  const prompt=pages.slice(promptStart,promptEnd);

  assert.ok(
    prompt.includes('<h2>Pembelian berhasil ✓</h2>')
  );
  assert.doesNotMatch(prompt,/Pembayaran berhasil ✓/);
  assert.match(
    prompt,
    /Beri rating untuk membantu pembeli lain mengetahui pengalaman kamu\./
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

test('post-payment rating prompt skips products already reviewed',()=>{
  const pages=read('public/js/pages.js');
  const orders=read('src/repositories/orders.repository.js');

  assert.match(
    pages,
    /filter\(item=>item\?\.product_id && !item\.has_review\)/
  );
  assert.match(
    orders,
    /'has_review',exists\([\s\S]*?from product_reviews pr[\s\S]*?pr\.product_id=oi\.product_id[\s\S]*?pr\.user_id=o\.user_id/
  );
});

test('review popup uses variant name or fixed product name',()=>{
  const pages=read('public/js/pages.js');

  assert.match(
    pages,
    /item\.variant_id \? \(item\.variant_label\|\|'Varian produk'\) : \(item\.product_name\|\|'Produk'\)/
  );
});

test('review popup star buttons keep 44px touch targets on mobile',()=>{
  const styles=read('public/css/components.css');
  const start=styles.indexOf('/* Post-payment review modal */');
  const end=styles.indexOf(
    '/* =========================\n   PRODUCT CREATE / EDIT MODAL',
    start
  );

  assert.ok(start>=0&&end>start);
  const popupStyles=styles.slice(start,end);

  assert.match(
    popupStyles,
    /\.payment-review-prompt \.product-review-star-button\{\s*width:44px;\s*height:44px;\s*min-width:44px;\s*flex:0 0 44px;/
  );
  assert.doesNotMatch(
    popupStyles,
    /\.payment-review-prompt \.product-review-star-button\{\s*width:38px;/
  );
});

test('review popup close actions dismiss consistently without changing shared modal',()=>{
  const pages=read('public/js/pages.js');
  const start=pages.indexOf('/* JYYR POST-PAYMENT REVIEW PROMPT */');
  const end=pages.indexOf(
    '/* shared-card-textarea-auto-resize */',
    start
  );
  assert.ok(start>=0&&end>start);

  const prompt=pages.slice(start,end);

  assert.match(
    prompt,
    /'\.modal\.payment-review-modal \[data-modal-close\]'/
  );
  assert.match(prompt,/event\.target!==backdrop/);
  assert.match(
    prompt,
    /window\.addEventListener\(\s*'keydown',[\s\S]*?event\.key!=='Escape'[\s\S]*?dismissPaymentReview\(orderId\)[\s\S]*?cleanPaymentReviewQuery\(\)[\s\S]*?\},\s*true\s*\)/
  );

  const modal=read('public/js/modal.js');
  assert.ok(modal.includes("function open(html, modalClass='')"));
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

  assert.doesNotMatch(detail,/data-product-review-form|name="comment"/);
  assert.doesNotMatch(detail,/aria-label="Komentar ulasan"/);
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

test('wallet orders render balance payment details without a gateway payment row',()=>{
  const controller=read('src/controllers/page.controller.js');
  const partial=read('views/partials/payment-details.ejs');

  assert.ok(controller.includes(
    "const isBalanceOrder=String(order.payment_method||'').trim().toUpperCase()==='BALANCE';"
  ));
  assert.ok(controller.includes("payment_method:'BALANCE'"));
  assert.ok(partial.includes("isBalancePayment ? 'Saldo'"));
  assert.ok(partial.includes(
    'Pembayaran menggunakan saldo JYYR-STORE berhasil dikonfirmasi.'
  ));
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


test('review summary uses variant icon or product cover in a square image',()=>{
  const repository=read('src/repositories/orders.repository.js');
  const api=read('src/controllers/api.controller.js');
  const pages=read('public/js/pages.js');
  const styles=read('public/css/components.css');

  assert.ok(
    repository.includes("'product_thumbnail_path',p.thumbnail_path")
  );
  assert.ok(
    repository.includes("'variant_icon_path',pv.icon_path")
  );
  assert.ok(
    repository.includes(
      'left join product_variants pv'
    )
  );
  assert.ok(api.includes("String(pricing_mode||'').toUpperCase()==='VARIANT'"));
  assert.ok(api.includes('review_image_url:imagePath'));
  assert.ok(pages.includes('payment-review-summary-image'));
  assert.match(
    styles,
    /\.payment-review-summary-image\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/
  );
});

console.log(
  'payment-review-flow.test.js: contract checks loaded'
);
