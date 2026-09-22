const { sensitiveRateLimit } = require('./security.middleware');
module.exports = { sensitiveRateLimit: sensitiveRateLimit() };
