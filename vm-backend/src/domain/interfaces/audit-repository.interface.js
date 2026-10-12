'use strict';

/**
 * Interface definition for Audit Event Repository (Append-only)
 */
class IAuditRepository {
  async save(auditEvent) { throw new Error('Not implemented'); }
  async findByCorrelationId(correlationId) { throw new Error('Not implemented'); }
  async findByUserId(userId, limit = 50) { throw new Error('Not implemented'); }
}

module.exports = IAuditRepository;
