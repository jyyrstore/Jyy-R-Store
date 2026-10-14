const { safeNextPath } = require('./url');

const FORM_METHODS = new Set([
  'POST',
  'PUT',
  'PATCH',
  'DELETE'
]);

const AUTH_FORM_PATHS = new Set([
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password'
]);

function isPageFormRequest(req) {
  const method = String(req?.method || '').toUpperCase();
  const path = String(
    req?.originalUrl || req?.url || ''
  ).split('?')[0];

  if (
    !FORM_METHODS.has(method) ||
    path === '/api' ||
    path.startsWith('/api/')
  ) {
    return false;
  }

  return Boolean(
    typeof req.is === 'function' &&
    req.is('application/x-www-form-urlencoded')
  );
}

function safeFormReturnPath(req) {
  const rawUrl = String(
    req?.originalUrl || req?.url || '/'
  );

  const queryIndex = rawUrl.indexOf('?');
  const path = queryIndex === -1
    ? rawUrl
    : rawUrl.slice(0, queryIndex);

  const requested =
    typeof req?.body?.returnTo === 'string'
      ? req.body.returnTo
      : '';

  if (path === '/cart/contact') {
    return requested === '/cart' ||
      /^\/product\/[a-z0-9-]+$/i.test(requested)
      ? requested
      : '/cart';
  }

  if (path === '/messages') {
    return /^\/messages(?:\/[0-9a-f-]+)?$/i.test(requested)
      ? requested
      : '/messages';
  }

  if (AUTH_FORM_PATHS.has(path)) {
    if (path === '/auth/login') {
      let requestedNext;

      try {
        requestedNext =
          new URL(rawUrl, 'http://jyyr-store.local')
            .searchParams.get('next') || '';
      } catch {
        return path;
      }

      if (requestedNext) {
        const nextPath = safeNextPath(
          requestedNext,
          '/dashboard'
        );

        return '/auth/login?next=' +
          encodeURIComponent(nextPath);
      }
    }

    return path;
  }

  return '/';
}

function renderPageFormError(req, res, {
  status = 400,
  code = 'FORM_ERROR',
  message = 'Formulir tidak dapat diproses. Coba lagi.'
} = {}) {
  if (!isPageFormRequest(req)) {
    return false;
  }

  const returnPath = safeFormReturnPath(req);

  res.status(status).render('app', {
    title: 'Formulir tidak dapat diproses',
    view: 'pages/error',
    req,
    csrfToken: req.csrfToken?.() || null,
    currentUser: req.user || null,
    profile: req.profile || null,
    status,
    code,
    message,
    returnPath,
    requestId: req.id || 'unknown'
  });

  return true;
}

module.exports = {
  isPageFormRequest,
  safeFormReturnPath,
  renderPageFormError
};
