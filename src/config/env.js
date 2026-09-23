const dotenv = require('dotenv');
const crypto = require('crypto');
dotenv.config();

const bool = (v, fallback = false) => v == null ? fallback : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
const int = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

let cached;
function loadEnv() {
  if (cached) return cached;
  const nodeEnv = process.env.NODE_ENV || 'development';
  const env = {
    NODE_ENV: nodeEnv,
    PORT: int(process.env.PORT, 3000),
    APP_URL: process.env.APP_URL || 'http://localhost:3000',
    APP_NAME: process.env.APP_NAME || "Jyy'R Store",
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_PUBLISHABLE_KEY:
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      '',
    SUPABASE_SECRET_KEY:
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    DATABASE_URL: process.env.DATABASE_URL || '',
    DATABASE_SSL_CA: process.env.DATABASE_SSL_CA || '',
    PUBLIC_ASSET_BUCKET: process.env.PUBLIC_ASSET_BUCKET || 'public-assets',
    PRIVATE_PRODUCT_BUCKET: process.env.PRIVATE_PRODUCT_BUCKET || 'private-products',
    USER_UPLOAD_BUCKET: process.env.USER_UPLOAD_BUCKET || 'user-uploads',
    SIGNED_URL_EXPIRATION: int(process.env.SIGNED_URL_EXPIRATION, 300),
    MAX_UPLOAD_MB: int(process.env.MAX_UPLOAD_MB, 100),
    SESSION_SECRET: process.env.SESSION_SECRET || '',
    COOKIE_SECRET: process.env.COOKIE_SECRET || '',
    CSRF_SECRET: process.env.CSRF_SECRET || '',
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER || 'generic-json',
    PAYMENT_API_BASE_URL: process.env.PAYMENT_API_BASE_URL || '',
    PAYMENT_API_KEY: process.env.PAYMENT_API_KEY || '',
    PAYMENT_SECRET_KEY: process.env.PAYMENT_SECRET_KEY || '',
    PAYMENT_WEBHOOK_SECRET: process.env.PAYMENT_WEBHOOK_SECRET || '',
    PAYMENT_WEBHOOK_SIGNATURE_HEADER: process.env.PAYMENT_WEBHOOK_SIGNATURE_HEADER || (String(process.env.PAYMENT_PROVIDER||'').toLowerCase()==='xendit' ? 'x-callback-token' : 'x-signature'),
    PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM: process.env.PAYMENT_WEBHOOK_SIGNATURE_ALGORITHM || 'sha256',
    PAYMENT_ENVIRONMENT: process.env.PAYMENT_ENVIRONMENT || 'sandbox',
    XENDIT_API_BASE_URL: process.env.XENDIT_API_BASE_URL || 'https://api.xendit.co',
    XENDIT_SECRET_KEY: process.env.XENDIT_SECRET_KEY || '',
    XENDIT_WEBHOOK_TOKEN: process.env.XENDIT_WEBHOOK_TOKEN || '',
    XENDIT_RETURN_URL: process.env.XENDIT_RETURN_URL || '',
    XENDIT_CANCEL_RETURN_URL: process.env.XENDIT_CANCEL_RETURN_URL || '',
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'smtp',
    EMAIL_FROM: process.env.EMAIL_FROM || '',
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME || "Jyy'R Store",
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO || '',
    SMTP_HOST: process.env.SMTP_HOST || '',
    SMTP_PORT: int(process.env.SMTP_PORT, 587),
    SMTP_USER: process.env.SMTP_USER || '',
    SMTP_PASSWORD: process.env.SMTP_PASSWORD || '',
    SMTP_FROM: process.env.SMTP_FROM || '',
    RATE_LIMIT_WINDOW_MS: int(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    RATE_LIMIT_MAX: int(process.env.RATE_LIMIT_MAX, 120),
    SENSITIVE_RATE_LIMIT_MAX: int(process.env.SENSITIVE_RATE_LIMIT_MAX, 20),
    PAYMENT_REQUEST_TIMEOUT_MS: int(process.env.PAYMENT_REQUEST_TIMEOUT_MS, 15000),
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
    ENABLE_CRON: bool(process.env.ENABLE_CRON, false),
    CRON_SECRET: process.env.CRON_SECRET || '',
    ALLOW_INCOMPLETE_DEV_CONFIG: bool(process.env.ALLOW_INCOMPLETE_DEV_CONFIG, true),
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    WHATSAPP_ORDER: process.env.WHATSAPP_ORDER || '',
    WHATSAPP_SUPPORT: process.env.WHATSAPP_SUPPORT || '',
    SOCIAL_INSTAGRAM: process.env.SOCIAL_INSTAGRAM || '',
    SOCIAL_TIKTOK: process.env.SOCIAL_TIKTOK || '',
    SOCIAL_YOUTUBE: process.env.SOCIAL_YOUTUBE || '',
    SOCIAL_TELEGRAM: process.env.SOCIAL_TELEGRAM || '',
    SOCIAL_DISCORD: process.env.SOCIAL_DISCORD || '',
    SOCIAL_GITHUB: process.env.SOCIAL_GITHUB || '',
    OWNER_USER_ID: process.env.OWNER_USER_ID || ''
  };
  const required = ['SESSION_SECRET', 'COOKIE_SECRET', 'CSRF_SECRET'];
  if (nodeEnv === 'production') {
    required.push(
      'SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'DATABASE_URL'
    );
    if(String(env.PAYMENT_PROVIDER||'').toLowerCase()==='xendit'){
      required.push('XENDIT_SECRET_KEY','XENDIT_WEBHOOK_TOKEN','XENDIT_RETURN_URL');
    }else{
      required.push('PAYMENT_WEBHOOK_SECRET');
    }
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  } else if (!env.SESSION_SECRET && !env.ALLOW_INCOMPLETE_DEV_CONFIG) {
    throw new Error('SESSION_SECRET is required. Set ALLOW_INCOMPLETE_DEV_CONFIG=true only for local scaffolding/verification.');
  }
  if (env.ENCRYPTION_KEY) {
    try { const raw = Buffer.from(env.ENCRYPTION_KEY, 'base64'); if (raw.length !== 32) throw new Error(); } catch { throw new Error('ENCRYPTION_KEY must be a base64 encoded 32-byte key.'); }
  }
  if (!/^https?:\/\//.test(env.APP_URL)) throw new Error('APP_URL must be an absolute HTTP(S) URL.');
  cached = env;
  return env;
}

function isConfigured() {
  const env = loadEnv();
  return Boolean(
    env.SUPABASE_URL &&
    env.SUPABASE_PUBLISHABLE_KEY &&
    env.SUPABASE_SECRET_KEY &&
    env.DATABASE_URL &&
    env.SESSION_SECRET
  );
}

function generateSecret() { return crypto.randomBytes(32).toString('base64url'); }
module.exports = { loadEnv, isConfigured, generateSecret };
