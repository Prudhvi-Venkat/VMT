'use strict';

const { RolePermissionPolicy } = require('../../domain/policies/role-permission-policy');

const AuthSerializer = {
  serializeUser(user) {
    if (!user) return null;
    const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || null;
    return {
      id: user.id,
      email: user.email,
      name,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
      roles: user.roles || [],
      status: user.status,
      scope: user.scope || 'platform',
      tenantId: user.tenantId || null,
      permissions: RolePermissionPolicy.getPermissionsForRoles(user.roles || []),
      mustChangePassword: Boolean(user.mustChangePassword),
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt || null
    };
  },

  serializeAuthResponse({ accessToken, refreshToken, tokenType, expiresIn, user }) {
    return {
      accessToken,
      refreshToken,
      tokenType: tokenType || 'Bearer',
      expiresIn,
      user: this.serializeUser(user)
    };
  }
};

module.exports = AuthSerializer;
