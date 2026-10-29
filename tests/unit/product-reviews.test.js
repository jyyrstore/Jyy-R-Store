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

test('product reviews migration defines required database contract',()=>{
  const sql=read(
    'database/migrations/038_product_reviews.sql'
  );

  assert.match(
    sql,
    /create table if not exists public\.product_reviews/i
  );

  assert.match(
    sql,
    /product_id uuid not null[\s\S]*references public\.products\(id\)/i
  );

  assert.match(
    sql,
    /user_id uuid not null[\s\S]*references public\.profiles\(id\)/i
  );

  assert.match(
    sql,
    /check\(rating between 1 and 5\)/i
  );

  assert.match(
    sql,
    /length\(btrim\(comment\)\) between 1 and 2000/i
  );

  assert.match(
    sql,
    /ux_product_reviews_product_user/i
  );
});

test('product reviews policy keeps the table server-only',()=>{
  const sql=read(
    'database/policies/product_reviews.sql'
  );

  assert.match(
    sql,
    /alter table public\.product_reviews enable row level security/i
  );

  assert.match(
    sql,
    /revoke all privileges[\s\S]*from public, anon, authenticated/i
  );

  assert.doesNotMatch(
    sql,
    /create policy product_reviews_/i
  );
});

test('product reviews repository enforces verified purchases and one review per buyer',()=>{
  const source=read(
    'src/repositories/product-reviews.repository.js'
  );

  assert.match(
    source,
    /const PURCHASE_STATUSES=\['PAID','PROCESSING','COMPLETED'\]/
  );

  assert.match(
    source,
    /o\.status=any\(\$3::order_status\[\]\)/
  );

  assert.match(
    source,
    /on conflict\(product_id,user_id\)\s*do nothing/
  );

  assert.match(
    source,
    /new AppError\(\s*409,\s*'REVIEW_ALREADY_EXISTS'/
  );

  assert.doesNotMatch(
    source,
    /rating=excluded\.rating|comment=excluded\.comment/
  );

  assert.match(
    source,
    /normalizedComment=String\(comment\|\|''\)\.trim\(\)\|\|\s*'Tidak Ada Komentar Untuk Pesanan Ini'/
  );

  assert.match(
    source,
    /normalizedComment\.length>100/
  );
});

test('product review API is authenticated and validated',()=>{
  const source=read('src/routes/index.js');

  assert.match(
    source,
    /apiRouter\.post\('\/products\/:id\/review'/
  );

  assert.match(
    source,
    /apiRouter\.post\('\/products\/:id\/review'[\s\S]*requireAuth/
  );

  assert.match(
    source,
    /productReviewSchema/
  );

  assert.match(
    source,
    /rating:z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(5\)/
  );

  assert.match(
    source,
    /comment:z\.string\(\)\.trim\(\)\.max\(100\)\.optional\(\)\.transform\(comment=>comment\|\|'Tidak Ada Komentar Untuk Pesanan Ini'\)/
  );
});

test('product detail keeps review summary but no longer contains the review editor',()=>{
  const source=read(
    'views/pages/product-detail.ejs'
  );

  assert.equal(
    (source.match(/<section class="page-shell">/g)||[]).length,
    1
  );

  assert.match(
    source,
    /<section[\s\S]*class="product-reviews-section"/
  );

  assert.match(
    source,
    /product-detail-recommendations/
  );

  assert.match(
    source,
    /param:'reviewPage'/
  );

  assert.doesNotMatch(
    source,
    /data-product-review-form/
  );

  assert.doesNotMatch(
    source,
    /Rate Bintang/
  );

  assert.doesNotMatch(
    source,
    /Perbarui ulasan Anda/
  );

  assert.match(
    source.trimEnd(),
    /<\/section>$/
  );
});

test('order detail displays variant labels and product image data',()=>{
  const view=read('views/pages/order-detail.ejs');
  const repository=read('src/repositories/orders.repository.js');
  const styles=read('public/css/store.css');

  assert.ok(view.includes(
    "<span><%= item.variant_id ? (item.variant_label || '—') : item.product_name %></span>"
  ));
  assert.match(
    repository,
    /'variant_id',oi\.variant_id,[\s\S]*'product_name',coalesce\(oi\.product_name,p\.name\),[\s\S]*'variant_label',oi\.variant_label/
  );
  assert.match(repository, /'product_thumbnail_path',p\.thumbnail_path/);
  assert.match(repository, /'variant_icon_path',pv\.icon_path/);
  assert.match(
    repository,
    /left join product_variants pv\s+on pv\.id=oi\.variant_id and pv\.product_id=oi\.product_id/
  );

  assert.match(
    view,
    /item\.variant_icon_path \|\| item\.product_thumbnail_path/
  );
  assert.match(
    view,
    /item\.variant_id \? \(item\.variant_label \|\| item\.product_name\) : item\.product_name/
  );
  assert.match(view, /class="order-item-content-copy"/);
  assert.match(view, /class="order-item-content-meta"/);
  assert.doesNotMatch(view, /<span><%= c\.title %><\/span>/);
  assert.match(view, /class="badge order-item-content-status"/);
  assert.match(
    styles,
    /\.order-item-product-image\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/
  );
});

test('order detail does not expose a rating editor',()=>{
  const source=read(
    'views/pages/order-detail.ejs'
  );

  assert.doesNotMatch(source,/order-product-review/);
  assert.doesNotMatch(source,/data-product-review-form/);
  assert.doesNotMatch(source,/Rate Bintang/);
  assert.doesNotMatch(source,/Perbarui ulasan Anda/);
  assert.doesNotMatch(source,/data-review-rating/);
});


test('order detail controller does not load review-editor state',()=>{
  const source=read(
    'src/controllers/page.controller.js'
  );

  assert.doesNotMatch(source,/productReviews\.viewerState\(/);
  assert.doesNotMatch(source,/viewerReview:reviewViewer\.review/);
  assert.doesNotMatch(source,/canReview:reviewViewer\.canReview/);
});


test('product review frontend is wired to the authenticated API',()=>{
  const source=read('public/js/pages.js');

  assert.match(
    source,
    /JYYR PRODUCT REVIEWS/
  );

  assert.match(
    source,
    /data-product-review-form/
  );

  assert.match(
    source,
    /\/api\/products\/'/
  );

  assert.match(
    source,
    /\/review'/
  );

  assert.match(
    source,
    /method:'POST'/
  );

  assert.match(
    source,
    /Ulasan berhasil disimpan/
  );
});

console.log('product-reviews.test.js: contract checks loaded');
