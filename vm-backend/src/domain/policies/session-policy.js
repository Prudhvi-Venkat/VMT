'use strict';

const crypto = require('crypto');
const { SessionStatus } = require('../entities/session.entity');

const SessionPolicy = {
  hashRefreshToken(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Refresh token must be a string');
    }
    return crypto.createHash('sha256').update(token).digest('hex');
  },

  compareTokenHash(rawToken, storedHash) {
    if (!rawToken || !storedHash) return false;
    const computedHash = this.hashRefreshToken(rawToken);
    const bufA = Buffer.from(computedHash, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  },

  /**
   * Evaluates if session is valid for token refresh
   */
  evaluateRefresh(session, user, incomingTokenHash, now = new Date()) {
    if (!session) {
      return { valid: false, reason: 'SESSION_NOT_FOUND' };
    }

    if (session.status === SessionStatus.COMPROMISED) {
      return { valid: false, reason: 'SESSION_COMPROMISED' };
    }

    if (session.status === SessionStatus.REVOKED) {
      return { valid: false, reason: 'SESSION_REVOKED' };
    }

    if (session.isExpired(now)) {
      return { valid: false, reason: 'SESSION_EXPIRED' };
    }

    // Token Reuse / Replay Detection:
    // If incoming token hash does NOT match the active session's refreshTokenHash,
    // a rotated (previous) or invalid token is being presented.
    if (session.refreshTokenHash !== incomingTokenHash) {
      return {
        valid: false,
        reuseDetected: true,
        reason: 'REFRESH_TOKEN_REUSE_DETECTED'
      };
    }

    // Ensure user account is still active
    if (!user || !user.isActive(now)) {
      return { valid: false, reason: 'USER_INACTIVE' };
    }

    return { valid: true };
  }
};

module.exports = SessionPolicy;
