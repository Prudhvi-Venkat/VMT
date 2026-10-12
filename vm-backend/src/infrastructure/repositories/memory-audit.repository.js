'use strict';

const IAuditRepository = require('../../domain/interfaces/audit-repository.interface');
const { AuditEvent } = require('../../domain/entities/audit-event.entity');

class MemoryAuditRepository extends IAuditRepository {
  constructor() {
    super();
    this.events = [];
  }

  async save(auditEvent) {
    const copy = new AuditEvent(auditEvent);
    this.events.push(copy);
    return new AuditEvent(copy);
  }

  async findByCorrelationId(correlationId) {
    return this.events
      .filter(e => e.correlationId === correlationId)
      .map(e => new AuditEvent(e));
  }

  async findByUserId(userId, limit = 50) {
    return this.events
      .filter(e => e.actor.userId === userId)
      .slice(-limit)
      .map(e => new AuditEvent(e));
  }

  async findByTenantId(tenantId, { userId, action, limit = 50, offset = 0 } = {}) {
    let filtered = this.events.filter(e => e.tenantId === tenantId);
    if (userId) filtered = filtered.filter(e => (e.actor?.userId === userId || e.userId === userId));
    if (action) filtered = filtered.filter(e => e.action === action);
    const total = filtered.length;
    const items = filtered.slice(offset, offset + limit).map(e => new AuditEvent(e));
    return { items, total };
  }

  getAllEvents() {
    return this.events.map(e => new AuditEvent(e));
  }

  clear() {
    this.events = [];
  }
}

module.exports = MemoryAuditRepository;
