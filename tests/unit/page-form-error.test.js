const test = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

const {
  isPageFormRequest,
  renderPageFormError
} = require('../../src/utils/form-error');

function makeRequest({
  url = '/auth/login',
  method = 'POST',
  contentType = 'application/x-www-form-urlencoded',
  body = {}
} = {}) {
  return {
    originalUrl: url,
    url,
    method,
    body,
    contentType,
    id: 'test-request-id',
    user: null,
    profile: null,
    csrfToken: () => 'test-csrf-token',
    is(type) {
      return this.contentType === type ? type : false;
    }
  };
}

function makeResponse() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.rendered = { view, locals };
      return this;
    },
    json(value) {
      this.jsonBody = value;
      return this;
    }
  };
}

test('HTML form errors render a readable page with a safe return link', () => {
  const req = makeRequest({
    url: '/auth/register',
    body: { email: 'invalid' }
  });
  const res = makeResponse();

  const handled = renderPageFormError(req, res, {
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'Data formulir belum valid.'
  });

  assert.equal(handled, true);
  assert.equal(res.statusCode, 422);
  assert.equal(res.rendered.view, 'app');
  assert.equal(res.rendered.locals.view, 'pages/error');
  assert.equal(res.rendered.locals.returnPath, '/auth/register');
  assert.equal(res.rendered.locals.message, 'Data formulir belum valid.');
});

test('return path from contact form is restricted to local allowed pages', () => {
  const req = makeRequest({
    url: '/cart/contact',
    body: { returnTo: 'https://example.invalid/steal' }
  });
  const res = makeResponse();

  renderPageFormError(req, res, {
    status: 403,
    code: 'CSRF_INVALID',
    message: 'Token tidak valid.'
  });

  assert.equal(res.rendered.locals.returnPath, '/cart');
});

test('message detail form can return only to an internal message path', () => {
  const req = makeRequest({
    url: '/messages',
    body: {
      returnTo: '/messages/550e8400-e29b-41d4-a716-446655440000'
    }
  });
  const res = makeResponse();

  renderPageFormError(req, res, {
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Terlalu banyak percobaan.'
  });

  assert.equal(
    res.rendered.locals.returnPath,
    '/messages/550e8400-e29b-41d4-a716-446655440000'
  );
});

test('API URL-encoded requests are excluded from page-form handling', () => {
  const req = makeRequest({ url: '/api/auth/login' });
  const res = makeResponse();

  assert.equal(isPageFormRequest(req), false);
  assert.equal(renderPageFormError(req, res, {
    status: 422,
    code: 'VALIDATION_ERROR',
    message: 'Error formulir.'
  }), false);
  assert.equal(res.rendered, undefined);
});

test('JSON requests are excluded from page-form handling', () => {
  const req = makeRequest({
    url: '/auth/login',
    contentType: 'application/json'
  });

  assert.equal(isPageFormRequest(req), false);
});

test('validation middleware preserves the existing API JSON contract', () => {
  const { validate } = require('../../src/middleware/validation.middleware');
  const req = makeRequest({
    url: '/api/auth/login',
    contentType: 'application/x-www-form-urlencoded',
    body: { email: 'not-an-email' }
  });
  const res = makeResponse();

  validate(z.object({
    email: z.string().email()
  }))(req, res, () => {
    assert.fail('Invalid input should not reach next().');
  });

  assert.equal(res.statusCode, 422);
  assert.equal(res.jsonBody.success, false);
  assert.equal(res.jsonBody.error.code, 'VALIDATION_ERROR');
  assert.equal(
    res.jsonBody.error.message,
    'Please correct the highlighted fields.'
  );
  assert.equal(res.rendered, undefined);
});
