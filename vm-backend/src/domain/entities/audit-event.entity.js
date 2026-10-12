'use strict';

const AuditActions = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  ACCOUNT_LOCKED: 'auth.account.locked',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  REFRESH_SUCCESS: 'auth.refresh.success',
  REFRESH_FAILURE: 'auth.refresh.failure',
  REFRESH_REUSE_DETECTED: 'auth.refresh.reuse_detected',
  SESSION_REVOKED: 'auth.session.revoked',
  SESSION_EXPIRED: 'auth.session.expired',
  USER_DISABLED: 'auth.user.disabled',
  AUTHORIZATION_DENIED: 'auth.authorization.denied'
};

class AuditEvent {
  constructor({
    id,
    tenantId = null,
    actor = {},
    action,
    resource = {},
    details = {},
    correlationId = null,
    timestamp = new Date()
  }) {
    this.id = id;
    this.tenantId = tenantId || null;
    this.actor = {
      userId: actor.userId || null,
      roles: actor.roles || [],
      ip: actor.ip || null,
      userAgent: actor.userAgent || null
    };
    this.action = action;
    this.resource = {
      type: resource.type || 'auth',
      id: resource.id || null
    };
    this.details = details || {};
    this.correlationId = correlationId || null;
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
  }
}

module.exports = {
  AuditEvent,
  AuditActions
};
