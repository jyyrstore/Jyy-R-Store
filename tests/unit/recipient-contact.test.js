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
