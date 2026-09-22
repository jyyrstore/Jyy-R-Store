const crypto = require('crypto');
function randomId(prefix='') { return `${prefix}${crypto.randomBytes(10).toString('hex')}`; }
function hmac(value, secret, alg='sha256') { return crypto.createHmac(alg, secret).update(value).digest('hex'); }
module.exports = { randomId, hmac };
