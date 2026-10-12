'use strict';

const { RolePermissionPolicy } = require('../domain/policies/role-permission-policy');
const { policyEngine: defaultPolicyEngine } = require('../domain/policies/authorization-policy-engine');
const { AuditActions } = require('../domain/entities/audit-event.entity');

function createAuthorizeMiddleware(auditService = null, policyEngine = defaultPolicyEngine) {
  return {
    policyEngine,

    requireAuthenticated() {
      return (req, res, next) => {
        if (!req.principal || !req.principal.userId) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }
        next();
      };
    },

    requirePlatformScope() {
      return (req, res, next) => {
        if (!req.principal || !req.principal.userId) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }
        if (!req.principal.isPlatformScope || !req.principal.isPlatformScope() || req.principal.scope !== 'platform') {
          return res.status(403).json({
            error: {
              code: 'PLATFORM_SCOPE_REQUIRED',
              message: 'Access denied: platform administrator scope required',
              requestId: req.id
            }
          });
        }
        next();
      };
    },

    requireScope(expectedScope) {
      return (req, res, next) => {
        if (!req.principal || !req.principal.userId) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }
        if (req.principal.scope !== expectedScope) {
          return res.status(403).json({
            error: {
              code: 'INVALID_SCOPE',
              message: `Access denied: ${expectedScope} scope required`,
              requestId: req.id
            }
          });
        }
        next();
      };
    },

    requirePermission(permission) {
      if (!permission) {
        return (req, res) => res.status(500).json({
          error: {
            code: 'AUTHORIZATION_CONFIG_ERROR',
            message: 'Permission parameter is required',
            requestId: req.id
          }
        });
      }

      return async (req, res, next) => {
        if (!req.principal) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }

        const allowed = RolePermissionPolicy.hasPermission(req.principal.permissions, permission);
        if (!allowed) {
          if (auditService) {
            await auditService.recordEvent({
              actor: {
                userId: req.principal.userId,
                roles: req.principal.roles,
                ip: req.ip,
                userAgent: req.headers['user-agent']
              },
              action: AuditActions.AUTHORIZATION_DENIED,
              resource: { type: 'permission', id: permission },
              details: { requiredPermission: permission, userPermissions: req.principal.permissions },
              correlationId: req.correlationId
            });
          }
          return res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: insufficient permissions',
              requestId: req.id
            }
          });
        }

        next();
      };
    },

    requireRole(role) {
      if (!role) {
        return (req, res) => res.status(500).json({
          error: {
            code: 'AUTHORIZATION_CONFIG_ERROR',
            message: 'Role parameter is required',
            requestId: req.id
          }
        });
      }

      return async (req, res, next) => {
        if (!req.principal) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }

        const hasRole = RolePermissionPolicy.hasRole(req.principal.roles, role);
        if (!hasRole) {
          if (auditService) {
            await auditService.recordEvent({
              actor: {
                userId: req.principal.userId,
                roles: req.principal.roles,
                ip: req.ip,
                userAgent: req.headers['user-agent']
              },
              action: AuditActions.AUTHORIZATION_DENIED,
              resource: { type: 'role', id: role },
              details: { requiredRole: role, userRoles: req.principal.roles },
              correlationId: req.correlationId
            });
          }
          return res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: 'Access denied: insufficient role',
              requestId: req.id
            }
          });
        }

        next();
      };
    },

    evaluatePolicy(action, getResource = null) {
      if (!action) {
        return (req, res) => res.status(500).json({
          error: {
            code: 'AUTHORIZATION_CONFIG_ERROR',
            message: 'Action parameter is required',
            requestId: req.id
          }
        });
      }

      return async (req, res, next) => {
        if (!req.principal || !req.principal.userId) {
          return res.status(401).json({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              requestId: req.id
            }
          });
        }

        const resource = typeof getResource === 'function' ? await getResource(req) : (req.resource || {});
        const decision = policyEngine.evaluate({
          subject: req.principal,
          action,
          resource,
          environment: {
            ip: req.ip,
            userAgent: req.headers['user-agent'],
            time: new Date()
          }
        });

        if (!decision.allowed) {
          if (auditService) {
            await auditService.recordEvent({
              actor: {
                userId: req.principal.userId,
                roles: req.principal.roles,
                ip: req.ip,
                userAgent: req.headers['user-agent']
              },
              action: AuditActions.AUTHORIZATION_DENIED,
              resource: { type: resource.type || 'action', id: resource.id || action },
              details: {
                reason: decision.reason,
                decisionDetails: decision.decisionDetails
              },
              correlationId: req.correlationId
            });
          }

          return res.status(403).json({
            error: {
              code: 'FORBIDDEN',
              message: `Access denied: ${decision.reason}`,
              reason: decision.reason,
              requestId: req.id
            }
          });
        }

        req.policyDecision = decision;
        next();
      };
    }
  };
}

module.exports = createAuthorizeMiddleware;
