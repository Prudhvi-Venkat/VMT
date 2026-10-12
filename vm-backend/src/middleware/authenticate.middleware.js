'use strict';

const JwtService = require('../infrastructure/security/jwt.service');
const { AuthenticatedPrincipal } = require('../domain/entities/principal.entity');
const { RolePermissionPolicy } = require('../domain/policies/role-permission-policy');
const { AuditActions } = require('../domain/entities/audit-event.entity');

function createAuthenticateMiddleware({ sessionRepository, userRepository, auditService, tenantRepository }) {
  return async function authenticateRequest(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication credentials are required',
          requestId: req.id
        }
      });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN_FORMAT',
          message: 'Authorization header must use Bearer scheme',
          requestId: req.id
        }
      });
    }

    const token = parts[1];
    const verification = JwtService.verifyAccessToken(token);

    if (!verification.valid) {
      return res.status(401).json({
        error: {
          code: verification.error || 'INVALID_TOKEN',
          message: verification.message || 'Token verification failed',
          requestId: req.id
        }
      });
    }

    const payload = verification.payload;
    const sessionId = payload.sid;
    const userId = payload.sub;

    let session = null;
    let user = null;

    // 5. Load authoritative session from sessionRepository
    session = await sessionRepository.findById(sessionId);

    // Check tenant database and verify tenant status if tenant scope is present
    if (payload.scope === 'tenant' && payload.tenantId) {
      let tenantRecord = null;
      if (tenantRepository && typeof tenantRepository.findByKey === 'function') {
        try {
          tenantRecord = await tenantRepository.findByKey(payload.tenantId);
        } catch (e) {}
      }
      if (!tenantRecord) {
        try {
          const { tenantDbManager } = require('../infrastructure/database/tenant-database-manager');
          if (tenantDbManager?.client) {
            const platformDb = tenantDbManager.getPlatformDb();
            tenantRecord = await platformDb.collection('tenants').findOne({
              $or: [{ tenantKey: payload.tenantId }, { id: payload.tenantId }]
            });
          }
        } catch (e) {}
      }

      if (!tenantRecord) {
        if (auditService) {
          await auditService.recordEvent({
            actor: { userId, ip: req.ip, userAgent: req.headers['user-agent'] },
            action: AuditActions.ACCESS_DENIED,
            resource: { type: 'tenant', id: payload.tenantId },
            details: { reason: 'TENANT_NOT_FOUND' },
            correlationId: req.correlationId
          });
        }
        return res.status(403).json({
          error: {
            code: 'TENANT_NOT_FOUND',
            message: `Tenant account "${payload.tenantId}" was not found`,
            requestId: req.id
          }
        });
      }

      if (tenantRecord.status && tenantRecord.status !== 'ACTIVE') {
        if (auditService) {
          await auditService.recordEvent({
            actor: { userId, ip: req.ip, userAgent: req.headers['user-agent'] },
            action: AuditActions.ACCESS_DENIED,
            resource: { type: 'tenant', id: payload.tenantId },
            details: { reason: 'TENANT_INACTIVE', status: tenantRecord.status },
            correlationId: req.correlationId
          });
        }
        return res.status(403).json({
          error: {
            code: 'TENANT_INACTIVE',
            message: `Tenant account "${payload.tenantId}" is ${tenantRecord.status.toLowerCase()}`,
            requestId: req.id
          }
        });
      }

      try {
        const { tenantDbManager } = require('../infrastructure/database/tenant-database-manager');
        const tenantDb = tenantDbManager.getTenantDb(payload.tenantId);
        const { Session } = require('../domain/entities/session.entity');
        const { User } = require('../domain/entities/user.entity');
        
        if (!session) {
          const sessionDoc = await tenantDb.collection('sessions').findOne({ id: sessionId });
          if (sessionDoc) session = new Session(sessionDoc);
        }

        const userDoc = await tenantDb.collection('users').findOne({ id: userId });
        if (userDoc) user = new User(userDoc);
      } catch (e) {
        // Fallback to default repositories
      }
    }

    if (!session || !session.isActive()) {
      if (auditService) {
        await auditService.recordEvent({
          actor: { userId, ip: req.ip, userAgent: req.headers['user-agent'] },
          action: session && session.isExpired() ? AuditActions.SESSION_EXPIRED : AuditActions.SESSION_REVOKED,
          resource: { type: 'session', id: sessionId },
          details: { status: session ? session.status : 'NOT_FOUND' },
          correlationId: req.correlationId
        });
      }
      return res.status(401).json({
        error: {
          code: 'SESSION_INVALID',
          message: 'Session has been revoked or expired',
          requestId: req.id
        }
      });
    }

    // 6 & 7. Load and validate user status
    if (!user) {
      user = await userRepository.findById(userId);
    }
    if (!user || !user.isActive()) {
      if (auditService) {
        await auditService.recordEvent({
          actor: { userId, ip: req.ip, userAgent: req.headers['user-agent'] },
          action: AuditActions.USER_DISABLED,
          resource: { type: 'user', id: userId },
          details: { status: user ? user.status : 'NOT_FOUND' },
          correlationId: req.correlationId
        });
      }
      return res.status(401).json({
        error: {
          code: 'USER_INACTIVE',
          message: 'User account is inactive or disabled',
          requestId: req.id
        }
      });
    }

    // 8 & 9. Construct AuthenticatedPrincipal & attach to request
    const permissions = RolePermissionPolicy.getPermissionsForRoles(user.roles);
    req.principal = new AuthenticatedPrincipal({
      userId: user.id,
      sessionId: session.id,
      scope: user.scope,
      tenantId: user.tenantId,
      roles: user.roles,
      permissions,
      authenticationMethod: 'password'
    });
    req.user = req.principal;
    req.tenantId = user.tenantId;

    next();
  };
}

module.exports = createAuthenticateMiddleware;
