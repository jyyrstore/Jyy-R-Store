function pageParams(query) { const page = Math.max(1, Number.parseInt(query.page, 10) || 1); const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit,10) || 20)); return { page, limit, offset: (page - 1) * limit }; }
module.exports = { pageParams };
