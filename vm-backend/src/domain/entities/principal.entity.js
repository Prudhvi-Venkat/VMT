'use strict';

class AuthenticatedPrincipal {
  constructor({
    userId,
    sessionId,
    scope = 'platform',
    tenantId = null,
    roles = [],
    permissions = [],
    authenticationMethod = 'password'
  }) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.scope = scope;
    this.tenantId = tenantId;
    this.roles = Array.isArray(roles) ? roles : [roles];
    this.permissions = Array.isArray(permissions) ? permissions : [permissions];
    this.authenticationMethod = authenticationMethod;
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  hasPermission(permission) {
    if (!permission) return true;
    if (this.permissions.includes('*')) {
      return true;
    }
    if (this.permissions.includes('platform:*') && (permission.startsWith('platform:') || permission === '*')) {
      return true;
    }
    return this.permissions.includes(permission);
  }

  isPlatformScope() {
    return this.scope === 'platform';
  }
}

module.exports = {
  AuthenticatedPrincipal
};
