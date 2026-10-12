'use strict';

const crypto = require('crypto');

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
  keyLen: 64
};

// Pre-computed dummy hash for timing attack mitigation when user is not found
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = crypto.scryptSync('dummy_password_timing_mitigation', DUMMY_SALT, SCRYPT_PARAMS.keyLen, {
  N: SCRYPT_PARAMS.N,
  r: SCRYPT_PARAMS.r,
  p: SCRYPT_PARAMS.p,
  maxmem: SCRYPT_PARAMS.maxmem
}).toString('hex');
const DUMMY_STORED = `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${DUMMY_SALT}$${DUMMY_HASH}`;

const PasswordPolicy = {
  hash(password) {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_PARAMS.keyLen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
      maxmem: SCRYPT_PARAMS.maxmem
    });
    return `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derivedKey.toString('hex')}`;
  },

  verify(password, storedHash) {
    if (!password || !storedHash || typeof storedHash !== 'string') {
      return false;
    }
    const parts = storedHash.split('$');
    if (parts.length !== 4 || parts[0] !== 'scrypt') {
      return false;
    }

    // Parse params: N=16384,r=8,p=1
    const paramPairs = parts[1].split(',');
    const options = { maxmem: SCRYPT_PARAMS.maxmem };
    for (const pair of paramPairs) {
      const [k, v] = pair.split('=');
      options[k] = parseInt(v, 10);
    }
    const salt = parts[2];
    const originalHashHex = parts[3];
    const originalBuffer = Buffer.from(originalHashHex, 'hex');

    const derivedKey = crypto.scryptSync(password, salt, originalBuffer.length, {
      N: options.N || SCRYPT_PARAMS.N,
      r: options.r || SCRYPT_PARAMS.r,
      p: options.p || SCRYPT_PARAMS.p,
      maxmem: options.maxmem || SCRYPT_PARAMS.maxmem
    });

    if (derivedKey.length !== originalBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(derivedKey, originalBuffer);
  },

  dummyVerify(password = 'dummy') {
    return this.verify(password, DUMMY_STORED);
  },

  validateComplexity(password) {
    const errors = [];
    if (!password || typeof password !== 'string') {
      return {
        isValid: false,
        errors: ['Password must be a non-empty string']
      };
    }
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

module.exports = PasswordPolicy;
