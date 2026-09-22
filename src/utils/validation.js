const { z } = require('zod');
const email = z.string().email().max(254);
const password = z.string().min(8).max(72);
const positiveInt = z.coerce.number().int().positive();
module.exports = { z, email, password, positiveInt };
