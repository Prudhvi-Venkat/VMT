'use strict';

const crypto = require('crypto');
const { AuditEvent, AuditActions } = require('../../domain/entities/audit-event.entity');
const logger = require('../../observability/logger');

class AuditService {
  constructor(auditRepository) {
    this.auditRepository = auditRepository;
  }

  async recordEvent({
    tenantId = null,
    actor = {},
    action,
    resource = {},
    details = {},
    correlationId = null,
    timestamp = new Date()
  }) {
    try {
      // Ensure details are scrubbed of any credentials/secrets
      const cleanDetails = logger.scrub(details);
      
      const event = new AuditEvent({
        id: crypto.randomUUID(),
        tenantId,
        actor: {
          userId: actor.userId || null,
          roles: actor.roles || [],
          ip: actor.ip || null,
          userAgent: actor.userAgent || null
        },
        action,
        resource: {
          type: resource.type || 'auth',
          id: resource.id || null
        },
        details: cleanDetails,
        correlationId,
        timestamp
      });

      // Persist to authoritative append-only audit repository
      await this.auditRepository.save(event);

      // Log structured security audit log
      logger.info(`[AUDIT] ${action}`, {
        auditEventId: event.id,
        tenantId,
        action,
        actorUserId: event.actor.userId,
        actorRoles: event.actor.roles,
        resourceType: event.resource.type,
        resourceId: event.resource.id,
        correlationId,
        details: cleanDetails
      });

      return event;
    } catch (err) {
      logger.error('Failed to record audit event', { error: err.message, action, correlationId });
    }
  }
}

module.exports = {
  AuditService,
  AuditActions
};
