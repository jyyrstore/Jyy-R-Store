const test = require('node:test');
const assert = require('node:assert/strict');

// Set konfigurasi pengujian sebelum middleware memuat konfigurasi.
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'page-form-test-session-secret-32-bytes';
process.env.CSRF_SECRET = 'page-form-test-csrf-secret-32-bytes';
process.env.UPSTASH_REDIS_REST_URL = '';
process.env.UPSTASH_REDIS_REST_TOKEN = '';
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.SENSITIVE_RATE_LIMIT_MAX = '1';

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const {
  csrfMiddleware,
  sensitiveRateLimit
} = require('../../src/middleware/security.middleware');

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  return String(value ?? '').replace(
    /[&<>"']/g,
    char => entities[char]
  );
}

function createApp() {
  const app = express();

  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));

  // Renderer tipis untuk menguji middleware HTTP tanpa memuat layanan eksternal.
  app.use((req, res, next) => {
    res.render = (template, locals = {}) => {
      const view = escapeHtml(locals.view || template);
      const message = escapeHtml(locals.message || '');
      const returnLink = locals.returnPath
        ? `<a href="${escapeHtml(locals.returnPath)}">Kembali ke formulir</a>`
        : '';

      return res
        .status(res.statusCode || 200)
        .type('html')
        .send(
          `<main data-view="${view}">` +
          `<p>${message}</p>${returnLink}</main>`
        );
    };

    next();
  });

  app.use(csrfMiddleware);

  app.get('/csrf', (req, res) => {
    res.type('text').send(`csrf=${req.csrfToken()}`);
  });

  const limiter = sensitiveRateLimit();

  app.post('/auth/login', limiter, (req, res) => {
    res.status(204).end();
  });

  app.post('/api/auth/login', limiter, (req, res) => {
    res.status(204).end();
  });

  return app;
}

async function getCsrfToken(agent) {
  const response = await agent.get('/csrf').expect(200);
  const match = response.text.match(/csrf=([a-f0-9]+)/i);

  assert.ok(match, 'CSRF token harus diterbitkan untuk sesi pengujian.');
  return match[1];
}

test('CSRF invalid on page form renders readable HTML and preserves safe next', async () => {
  const agent = request.agent(createApp());

  const response = await agent
    .post('/auth/login?next=%2Fcheckout')
    .type('form')
    .send({ _csrf: 'invalid-token' })
    .expect(403)
    .expect('Content-Type', /html/);

  assert.match(response.text, /data-view="pages\/error"/);
  assert.match(response.text, /Sesi keamanan formulir/);
  assert.match(
    response.text,
    /href="\/auth\/login\?next=%2Fcheckout"/
  );
});

test('untrusted login next is replaced with a local fallback', async () => {
  const agent = request.agent(createApp());

  const response = await agent
    .post('/auth/login?next=https%3A%2F%2Fevil.invalid')
    .type('form')
    .send({ _csrf: 'invalid-token' })
    .expect(403);

  assert.match(
    response.text,
    /href="\/auth\/login\?next=%2Fdashboard"/
  );
  assert.doesNotMatch(response.text, /evil\.invalid/);
});

test('CSRF rejection on API keeps existing JSON contract', async () => {
  const response = await request(createApp())
    .post('/api/auth/login')
    .send({ email: 'user@example.test', password: 'password123' })
    .expect(403)
    .expect('Content-Type', /json/);

  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'CSRF_INVALID');
  assert.equal(response.body.error.message,
    'Security token is missing or invalid.');
});

test('rate limit renders helpful HTML for page forms', async () => {
  const agent = request.agent(createApp());
  const token = await getCsrfToken(agent);

  await agent
    .post('/auth/login?next=%2Fcheckout')
    .type('form')
    .send({ _csrf: token })
    .expect(204);

  const response = await agent
    .post('/auth/login?next=%2Fcheckout')
    .type('form')
    .send({ _csrf: token })
    .expect(429)
    .expect('Content-Type', /html/);

  assert.match(response.text, /data-view="pages\/error"/);
  assert.match(response.text, /Terlalu banyak percobaan/);
  assert.match(
    response.text,
    /href="\/auth\/login\?next=%2Fcheckout"/
  );
});

test('rate limit on API does not render the page-form error view', async () => {
  const agent = request.agent(createApp());
  const token = await getCsrfToken(agent);

  await agent
    .post('/api/auth/login')
    .type('form')
    .send({ _csrf: token })
    .expect(204);

  const response = await agent
    .post('/api/auth/login')
    .type('form')
    .send({ _csrf: token })
    .expect(429);

  assert.match(response.text, /Too many requests/i);
  assert.doesNotMatch(response.text, /data-view="pages\/error"/);
  assert.doesNotMatch(response.text, /Terlalu banyak percobaan/);
});
