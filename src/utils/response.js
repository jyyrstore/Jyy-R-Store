function ok(res, data = null, status = 200) { return res.status(status).json({ success: true, data }); }
function fail(res, code, message, status = 400, details) { return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } }); }
module.exports = { ok, fail };
