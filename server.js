const crypto = require('crypto');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const { loadEnv, isConfigured } = require('./src/config/env');
const { initDatabase, closeDatabase } = require('./src/config/database');
const { initSupabase } = require('./src/config/supabase');
const storage = require('./src/config/storage');
const { initStorage } = storage;
const { initPaymentProvider } = require('./src/config/payment');
const { initEmail } = require('./src/config/email');
const { createSessionMiddleware } = require('./src/config/session');
const { requestId, loggingMiddleware, csrfMiddleware, securityHeaders } = require('./src/middleware/security.middleware');
const { authMiddleware } = require('./src/middleware/auth.middleware');
const { maintenanceMiddleware } = require('./src/middleware/maintenance.middleware');
const { notFound } = require('./src/middleware/not-found.middleware');
const { errorHandler } = require('./src/middleware/error.middleware');
const { generalRateLimit, sensitiveRateLimit } = require('./src/middleware/security.middleware');
const { icon } = require('./src/utils/icons');
const { apiRouter, pageRouter, webhookRouter } = require('./src/routes');

async function createApp() {
  const env = loadEnv();
  await initDatabase(env);
  initSupabase(env);
  await initStorage(env);
  initPaymentProvider(env);
  initEmail(env);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.locals.appName = env.APP_NAME;
  app.locals.appUrl = env.APP_URL;
  app.locals.icon = icon;
  app.locals.assetUrl = (bucket, filePath) => filePath ? storage.publicUrl(bucket, filePath) : null;
  app.locals.formatIDR = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
  app.locals.formatDate = (value) => value ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
  app.locals.isConfigured = isConfigured();
  app.locals.publicAssetBucket = env.PUBLIC_ASSET_BUCKET;
  app.locals.socialLinks = [
    ['SOCIAL_INSTAGRAM','Instagram',env.SOCIAL_INSTAGRAM],
    ['SOCIAL_TIKTOK','TikTok',env.SOCIAL_TIKTOK],
    ['SOCIAL_YOUTUBE','YouTube',env.SOCIAL_YOUTUBE],
    ['SOCIAL_TELEGRAM','Telegram',env.SOCIAL_TELEGRAM],
    ['SOCIAL_GITHUB','GitHub',env.SOCIAL_GITHUB]
  ];

  app.use(requestId);
  app.use(loggingMiddleware);
  app.use(securityHeaders);
  app.use((req,res,next)=>{ res.locals.cspNonce=crypto.randomBytes(16).toString('base64'); helmet({crossOriginEmbedderPolicy:false,contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://cdn.jsdelivr.net',`'nonce-${res.locals.cspNonce}'`],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','blob:','https:'],mediaSrc:["'self'",'blob:','https:'],fontSrc:["'self'",'data:'],connectSrc:["'self'",'https:'],frameAncestors:["'none'"],objectSrc:["'none'"]}}})(req,res,next); });
  app.use(compression());
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Webhook must see the raw body for signature verification.
  app.use('/api/payment/webhook', webhookRouter);

  app.use(express.json({ limit: '2mb' }));
  app.use('/api', generalRateLimit());
  app.use('/api/auth', sensitiveRateLimit());
  app.use('/api/payment', sensitiveRateLimit());
  app.use('/api/deposit', sensitiveRateLimit());
  app.use('/api/orders', sensitiveRateLimit());
  app.use('/api/download', sensitiveRateLimit());
  app.use('/api/tickets', sensitiveRateLimit());
  app.use('/api/messages', sensitiveRateLimit());
  app.use('/api/owner', sensitiveRateLimit());
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: env.NODE_ENV === 'production' ? '1d' : 0 }));
  app.use(createSessionMiddleware());
  app.use(authMiddleware);
  app.use(csrfMiddleware);
  app.use(maintenanceMiddleware);

  app.get('/health', async (req, res) => {
    const status = isConfigured() ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({ success: true, status, service: 'jyyr-store', requestId: req.id });
  });

  app.use('/api', apiRouter);
  app.use('/', pageRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  try {
    const app = await createApp();
    const env = loadEnv();
    const server = app.listen(env.PORT, () => console.log(`[JyyR Store] listening on ${env.APP_URL}`));
    const shutdown = async (signal) => {
      console.log(`[JyyR Store] ${signal} received, shutting down`);
      server.close(async () => { await closeDatabase(); process.exit(0); });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('[JyyR Store] startup failed:', error.message);
    process.exit(1);
  }
}

let vercelAppPromise;

async function vercelHandler(req, res) {
  if (!vercelAppPromise) {
    vercelAppPromise = createApp();
  }

  const app = await vercelAppPromise;
  return app(req, res);
}

if (require.main === module) start();

if (process.env.VERCEL) {
  module.exports = vercelHandler;
} else {
  module.exports = { createApp };
}
