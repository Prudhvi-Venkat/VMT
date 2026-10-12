'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  
  database: {
    url: process.env.DATABASE_URL || 'mongodb://localhost:27017',
    platformDbName: process.env.PLATFORM_DB_NAME || 'security_platform',
    intelligenceDbName: process.env.INTELLIGENCE_DB_NAME || 'security_intelligence',
    tenantDbPrefix: process.env.TENANT_DB_PREFIX || 'security_tenant_',
    dbName: process.env.DATABASE_NAME || 'security_platform'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET,
    issuer: process.env.JWT_ISSUER || 'exposure-platform',
    audience: process.env.JWT_AUDIENCE || 'exposure-platform-api',
    accessTokenTtlSeconds: parseInt(process.env.JWT_ACCESS_TOKEN_TTL_SECONDS || '900', 10) // 15 minutes
  },
  
  session: {
    refreshTokenTtlSeconds: parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS || '604800', 10), // 7 days
    sessionTtlSeconds: parseInt(process.env.SESSION_TTL_SECONDS || '604800', 10), // 7 days
  },
  
  security: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
    accountLockDurationMs: parseInt(process.env.ACCOUNT_LOCK_DURATION_MS || '900000', 10), // 15 minutes
    loginRateLimitWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    loginRateLimitMax: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
    refreshRateLimitWindowMs: parseInt(process.env.REFRESH_RATE_LIMIT_WINDOW_MS || '60000', 10),
    refreshRateLimitMax: parseInt(process.env.REFRESH_RATE_LIMIT_MAX || '20', 10),
    cookieSecure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'strict'
  }
};

module.exports = config;
