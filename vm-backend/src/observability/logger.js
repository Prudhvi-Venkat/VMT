'use strict';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'refreshtokenhash',
  'authorization',
  'cookie',
  'secret',
  'jwt_secret',
  'mfasecret',
  'mfa_secret',
  'privatekey',
  'private_key'
]);

function scrubSensitiveData(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (seen.has(obj)) {
    return '[CIRCULAR]';
  }
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => scrubSensitiveData(item, seen));
  }

  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes('password') || normalizedKey.includes('secret') || normalizedKey.includes('token')) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      clean[key] = scrubSensitiveData(value, seen);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

const logger = {
  log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const cleanMeta = scrubSensitiveData(meta);
    const logEntry = {
      timestamp,
      level,
      message,
      ...cleanMeta
    };
    const serialized = JSON.stringify(logEntry);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
    return logEntry;
  },

  info(message, meta = {}) {
    return this.log('info', message, meta);
  },

  warn(message, meta = {}) {
    return this.log('warn', message, meta);
  },

  error(message, meta = {}) {
    return this.log('error', message, meta);
  },

  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      return this.log('debug', message, meta);
    }
  },

  scrub(data) {
    return scrubSensitiveData(data);
  }
};

module.exports = logger;
