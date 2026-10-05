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
    /on conflict\(product_id,user_id\)/
  );

  assert.match(
    source,
    /rating=excluded\.rating/
  );

  assert.match(
    source,
    /comment=excluded\.comment/
  );

  assert.match(
    source,
    /updated_at=now\(\)/
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
    /comment:z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2000\)/
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

test('order detail contains the per-product review editor',()=>{
  const source=read(
    'views/pages/order-detail.ejs'
  );

  assert.match(
    source,
    /order-product-review/
  );

  assert.match(
    source,
    /data-product-review-form/
  );

  assert.match(
    source,
    /data-product-id/
  );

  assert.match(
    source,
    /Rate Bintang/
  );

  assert.match(
    source,
    /Perbarui ulasan Anda/
  );

  assert.match(
    source,
    /data-review-rating/
  );

  assert.match(
    source,
    /data-review-rating-value/
  );
});

test('order detail controller attaches review state to each purchased product',()=>{
  const source=read(
    'src/controllers/page.controller.js'
  );

  assert.match(
    source,
    /productReviews\.viewerState\(/
  );

  assert.match(
    source,
    /viewerReview:reviewViewer\.review/
  );

  assert.match(
    source,
    /canReview:reviewViewer\.canReview/
  );
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
