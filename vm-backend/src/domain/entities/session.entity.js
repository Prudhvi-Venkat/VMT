'use strict';

const SessionStatus = {
  ACTIVE: 'ACTIVE',
  REVOKED: 'REVOKED',
  EXPIRED: 'EXPIRED',
  COMPROMISED: 'COMPROMISED'
};

class Session {
  constructor({
    id,
    userId,
    platformScope = 'platform',
    tenantId = null,
    refreshTokenHash,
    tokenFamilyId,
    status = SessionStatus.ACTIVE,
    createdAt = new Date(),
    expiresAt,
    lastUsedAt = new Date(),
    revokedAt = null,
    revokeReason = null,
    ipMetadata = '',
    userAgentMetadata = '',
    securityMetadata = {}
  }) {
    this.id = id;
    this.userId = userId;
    this.platformScope = platformScope;
    this.tenantId = tenantId;
    this.refreshTokenHash = refreshTokenHash;
    this.tokenFamilyId = tokenFamilyId;
    this.status = status;
    this.createdAt = createdAt ? new Date(createdAt) : new Date();
    this.expiresAt = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    this.lastUsedAt = lastUsedAt ? new Date(lastUsedAt) : new Date();
    this.revokedAt = revokedAt ? new Date(revokedAt) : null;
    this.revokeReason = revokeReason || null;
    this.ipMetadata = ipMetadata || '';
    this.userAgentMetadata = userAgentMetadata || '';
    this.securityMetadata = securityMetadata || {};
  }

  isActive(now = new Date()) {
    if (this.status !== SessionStatus.ACTIVE) {
      return false;
    }
    if (this.expiresAt && this.expiresAt <= now) {
      return false;
    }
    return true;
  }

  isExpired(now = new Date()) {
    return this.expiresAt && this.expiresAt <= now;
  }

  revoke(reason = 'REVOKED', now = new Date()) {
    this.status = SessionStatus.REVOKED;
    this.revokedAt = now;
    this.revokeReason = reason;
  }

  markCompromised(reason = 'TOKEN_REUSE_DETECTED', now = new Date()) {
    this.status = SessionStatus.COMPROMISED;
    this.revokedAt = now;
    this.revokeReason = reason;
  }
}

module.exports = {
  Session,
  SessionStatus
};
