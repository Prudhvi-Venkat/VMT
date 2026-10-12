'use strict';

/**
 * Generic Role-to-Permissions Mapping
 * Supports PLATFORM_ADMIN currently, with extensible contract for future roles.
 */
const ROLE_PERMISSIONS = {
  PLATFORM_ADMIN: [
    'platform:*',
    'platform:admin',
    'platform:view',
    'platform:tenants:read',
    'platform:tenants:write',
    'platform:audit:read',
    'users:read',
    'users:write',
    'sessions:read',
    'sessions:revoke',
    'system:read',
    'system:admin',
    'audit:read',
    'findings:read',
    'findings:update',
    'scans:read',
    'scans:create',
    'scans:cancel',
    'sbom:upload',
    'sbom:scan',
    'exemptions:read',
    'exemptions:write',
    'exemptions:approve'
  ],
  TENANT_SUPER_ADMIN: [
    'tenant:admin',
    'tenant:users:read',
    'tenant:users:write',
    'tenant:projects:read',
    'tenant:projects:write',
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:delete',
    'scans:create',
    'scans:read',
    'scans:cancel',
    'sbom:upload',
    'sbom:review',
    'sbom:modify_components',
    'sbom:scan',
    'findings:read',
    'findings:update',
    'findings:assign',
    'findings:comment',
    'findings:resolve',
    'findings:close',
    'findings:reopen',
    'integrations:manage',
    'audit:read',
    'exemptions:read',
    'exemptions:write',
    'exemptions:approve'
  ],
  END_USER: [
    'tenant:projects:read',
    'assets:read',
    'scans:create',
    'scans:read',
    'sbom:upload',
    'sbom:review',
    'sbom:modify_components',
    'sbom:scan',
    'findings:read',
    'findings:update',
    'findings:comment',
    'findings:resolve',
    'findings:close'
  ],
  TENANT_ADMIN: [
    'tenant:admin',
    'tenant:users:read',
    'tenant:users:write',
    'tenant:projects:read',
    'tenant:projects:write',
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:delete',
    'scans:create',
    'scans:read',
    'scans:cancel',
    'sbom:upload',
    'sbom:review',
    'sbom:modify_components',
    'sbom:scan',
    'findings:read',
    'findings:update',
    'findings:assign',
    'findings:comment',
    'findings:resolve',
    'findings:close',
    'integrations:manage',
    'audit:read'
  ],
  SECURITY_MANAGER: [
    'tenant:projects:read',
    'assets:read',
    'assets:create',
    'assets:update',
    'assets:delete',
    'scans:create',
    'scans:read',
    'scans:cancel',
    'sbom:upload',
    'sbom:review',
    'findings:read',
    'findings:update',
    'findings:comment',
    'findings:assign',
    'findings:resolve',
    'findings:close',
    'findings:reopen',
    'audit:read'
  ],
  SECURITY_ADMIN: [
    'security:admin',
    'vulnerabilities:write',
    'assets:read',
    'assets:write',
    'assets:create',
    'assets:update',
    'assets:delete'
  ],
  SECURITY_ANALYST: [
    'tenant:projects:read',
    'assets:read',
    'scans:read',
    'sbom:review',
    'findings:read',
    'findings:comment',
    'reports:read'
  ],
  VIEWER: [
    'platform:view',
    'reports:read',
    'assets:read'
  ]
};

const RolePermissionPolicy = {
  getPermissionsForRoles(roles = []) {
    const permissions = new Set();
    for (const role of roles) {
      const perms = ROLE_PERMISSIONS[role];
      if (perms) {
        perms.forEach(p => permissions.add(p));
      }
    }
    return Array.from(permissions);
  },

  hasPermission(principalPermissions = [], requiredPermission) {
    if (!requiredPermission || typeof requiredPermission !== 'string') return false;
    if (principalPermissions.includes('*')) {
      return true;
    }
    if (principalPermissions.includes('platform:*') && (requiredPermission.startsWith('platform:') || requiredPermission === '*')) {
      return true;
    }
    return principalPermissions.includes(requiredPermission);
  },

  hasRole(principalRoles = [], requiredRole) {
    if (!requiredRole || typeof requiredRole !== 'string') return false;
    return principalRoles.includes(requiredRole);
  },

  validatePlatformScope(principal) {
    if (!principal || principal.scope !== 'platform') {
      return false;
    }
    return principal.hasRole('PLATFORM_ADMIN');
  }
};

module.exports = {
  RolePermissionPolicy,
  ROLE_PERMISSIONS
};
