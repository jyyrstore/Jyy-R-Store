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

console.log('recipient-contact.test.js: PASS');
