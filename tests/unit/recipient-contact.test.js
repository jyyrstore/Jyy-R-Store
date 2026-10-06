const { test } = require('node:test');
const assert=require('assert');

const {
  countryOptions,
  normalizeRecipientContact
}=require('../../src/utils/recipient-contact');

const id=normalizeRecipientContact({
  email:'Email@Gmail.com',
  countryCode:'ID',
  phone:'838 9077 7348'
});

assert.equal(id.email,'email@gmail.com');
assert.equal(id.phone,'83890777348');
assert.equal(id.phoneE164,'+6283890777348');

assert.throws(
  ()=>normalizeRecipientContact({
    email:'email@gmail.com',
    countryCode:'ID',
    phone:'083890777348'
  }),
  error=>error.code==='RECIPIENT_PHONE_INVALID'
);

assert.throws(
  ()=>normalizeRecipientContact({
    email:'email@gmail.com',
    countryCode:'ZZ',
    phone:'83890777348'
  }),
  error=>error.code==='RECIPIENT_COUNTRY_INVALID'
);

assert.equal(countryOptions()[0].code,'ID');
assert.equal(countryOptions()[0].dialCode,'+62');


const fs=require('fs');
const path=require('path');

const cartRepositorySource=fs.readFileSync(
  path.join(__dirname,'../../src/repositories/cart.repository.js'),
  'utf8'
);

const cartServiceSource=fs.readFileSync(
  path.join(__dirname,'../../src/services/cart/cart.service.js'),
  'utf8'
);

const orderServiceSource=fs.readFileSync(
  path.join(__dirname,'../../src/services/order/order.service.js'),
  'utf8'
);

assert.match(
  cartRepositorySource,
  /withTransaction/
);

assert.match(
  cartRepositorySource,
  /update public\.recipient_contacts set is_default=false/
);

assert.match(
  cartRepositorySource,
  /update carts set recipient_email=\$2,recipient_country_code=\$3,recipient_dial_code=\$4,recipient_phone=\$5/
);

assert.match(
  cartServiceSource,
  /await cart\.saveDefaultRecipientContact\(userId,normalized\)/
);

assert.match(
  cartServiceSource,
  /return normalized;/
);

assert.ok(
  (
    orderServiceSource.match(
      /from public\.recipient_contacts rc[\s\S]*?and rc\.is_default=true/g
    ) || []
  ).length >= 8,
  'order service harus menggunakan persistent recipient fallback pada wallet + gateway'
);

console.log('recipient-contact.test.js: PASS');

test('direct buy now keeps product out of cart',()=>{
  const assert=require('node:assert/strict');
  const fs=require('node:fs');
  const path=require('node:path');

  const root=path.resolve(__dirname,'../..');

  const pages=fs.readFileSync(
    path.join(root,'public/js/pages.js'),
    'utf8'
  );

  const checkout=fs.readFileSync(
    path.join(root,'views/pages/checkout.ejs'),
    'utf8'
  );

  const order=fs.readFileSync(
    path.join(root,'src/services/order/order.service.js'),
    'utf8'
  );

  const api=fs.readFileSync(
    path.join(root,'src/controllers/api.controller.js'),
    'utf8'
  );

  const controller=fs.readFileSync(
    path.join(root,'src/controllers/page.controller.js'),
    'utf8'
  );

  const buyHandler=pages.match(
    /const buy=e\.target\.closest\('\[data-buy-now\]'\);[\s\S]*?catch\(err\)\{toast\.error\(err\.message\);buy\.disabled=false\}\}/
  );

  assert.ok(
    buyHandler,
    'Handler Buy Now tidak ditemukan.'
  );

  assert.match(
    buyHandler[0],
    /location\.href='\/checkout\?buy_now='/
  );

  assert.doesNotMatch(
    buyHandler[0],
    /\/api\/cart/
  );

  assert.match(
    pages,
    /buyNowProduct/
  );

  assert.match(
    checkout,
    /data-buy-now-product/
  );

  assert.match(
    checkout,
    /preview\.directBuyNow/
  );

  assert.match(
    order,
    /function normalizeBuyNowProductId/
  );

  assert.match(
    order,
    /function directCheckoutContext/
  );

  assert.match(
    order,
    /buyNowProductId=null/
  );

  assert.match(
    order,
    /if\(!directBuyNow\)\{\s*await carts\.clear/
  );

  assert.match(
    api,
    /const buyNowProductId=req\.body\.buyNowProductId\|\|null/
  );

  assert.match(
    api,
    /createWalletOrder/
  );

  assert.match(
    api,
    /createGatewayOrder/
  );

  assert.match(
    controller,
    /req\.query\.buy_now/
  );
});
