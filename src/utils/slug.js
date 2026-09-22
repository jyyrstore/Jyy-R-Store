const slugify = require('slugify');
module.exports = (value) => slugify(String(value || ''), { lower: true, strict: true, trim: true });
