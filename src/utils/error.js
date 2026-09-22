class AppError extends Error { constructor(status, code, message, details = undefined) { super(message); this.status = status; this.code = code; this.details = details; this.expose = status < 500; } }
const badRequest = (code, message, details) => new AppError(400, code, message, details);
const unauthorized = (message='Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
const forbidden = (message='Forbidden') => new AppError(403, 'FORBIDDEN', message);
const notFound = (message='Not found') => new AppError(404, 'NOT_FOUND', message);
module.exports = { AppError, badRequest, unauthorized, forbidden, notFound };
