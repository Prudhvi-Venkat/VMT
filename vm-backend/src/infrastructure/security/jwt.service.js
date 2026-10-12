'use strict';

const crypto = require('crypto');
const config = require('../../config');

function base64UrlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function createHmacSignature(data, secret) {
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const JwtService = {
  /**
   * Generates a signed access token
   */
  signAccessToken({ userId, sessionId, roles = [], scope = 'platform', tenantId = null }) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + config.jwt.accessTokenTtlSeconds;

    const header = {
      alg: 'HS256',
      typ: 'JWT'
    };

    const payload = {
      jti: crypto.randomUUID(),
      sub: userId,
      sid: sessionId,
      roles: Array.isArray(roles) ? roles : [roles],
      scope,
      tenantId: tenantId || null,
      type: 'access',
      iss: config.jwt.issuer,
      aud: config.jwt.audience,
      iat: now,
      nbf: now,
      exp
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const signature = createHmacSignature(dataToSign, config.jwt.secret);

    return {
      token: `${dataToSign}.${signature}`,
      expiresIn: config.jwt.accessTokenTtlSeconds,
      expiresAt: new Date(exp * 1000)
    };
  },

  /**
   * Cryptographically verifies an access token
   */
  verifyAccessToken(token) {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'TOKEN_MISSING', message: 'Token is missing or not a string' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, error: 'MALFORMED_TOKEN', message: 'JWT must have 3 segments' };
    }

    const [encodedHeader, encodedPayload, receivedSignature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmacSignature(dataToSign, config.jwt.secret);

    // Constant-time signature comparison to prevent timing attacks
    const bufReceived = Buffer.from(receivedSignature);
    const bufExpected = Buffer.from(expectedSignature);

    if (bufReceived.length !== bufExpected.length || !crypto.timingSafeEqual(bufReceived, bufExpected)) {
      return { valid: false, error: 'INVALID_SIGNATURE', message: 'Cryptographic signature verification failed' };
    }

    let header;
    let payload;
    try {
      header = JSON.parse(base64UrlDecode(encodedHeader));
      payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
      return { valid: false, error: 'MALFORMED_TOKEN', message: 'Failed to decode token segments' };
    }

    // Algorithm & Type checks
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { valid: false, error: 'UNSUPPORTED_ALGORITHM', message: 'Unsupported algorithm or token type' };
    }

    const now = Math.floor(Date.now() / 1000);

    // Expiration check
    if (typeof payload.exp !== 'number' || payload.exp <= now) {
      return { valid: false, error: 'TOKEN_EXPIRED', message: 'Access token has expired' };
    }

    // Not Before check
    if (payload.nbf && typeof payload.nbf === 'number' && payload.nbf > now) {
      return { valid: false, error: 'TOKEN_NOT_ACTIVE', message: 'Token is not yet active' };
    }

    // Issuer & Audience validation
    if (payload.iss !== config.jwt.issuer) {
      return { valid: false, error: 'INVALID_ISSUER', message: 'Token issuer mismatch' };
    }
    if (payload.aud !== config.jwt.audience) {
      return { valid: false, error: 'INVALID_AUDIENCE', message: 'Token audience mismatch' };
    }

    // Token Type check
    if (payload.type !== 'access') {
      return { valid: false, error: 'INVALID_TOKEN_TYPE', message: 'Token is not an access token' };
    }

    // Required Claims check
    if (!payload.sub || !payload.sid || !payload.roles) {
      return { valid: false, error: 'MISSING_CLAIMS', message: 'Token is missing required claims' };
    }

    return {
      valid: true,
      payload
    };
  }
};

module.exports = JwtService;
