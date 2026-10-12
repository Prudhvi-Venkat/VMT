'use strict';

const IAuditRepository = require('../../domain/interfaces/audit-repository.interface');
const { AuditEvent } = require('../../domain/entities/audit-event.entity');
const { getDb } = require('../database/mongodb');

const { tenantDbManager } = require('../database/tenant-database-manager');

class MongoAuditRepository extends IAuditRepository {
  constructor(db = null, dbManager = tenantDbManager) {
    super();
    this.customDb = db;
    this.dbManager = dbManager;
  }

  get collection() {
    const db = this.customDb || getDb();
    if (!db) throw new Error('MongoDB database not connected');
    return db.collection('auditEvents');
  }

  async save(auditEvent) {
    const doc = { ...auditEvent };
    delete doc._id;
    await this.collection.insertOne(doc);

    // If event is scoped to a tenant, also persist into the tenant's audit_logs collection
    if (auditEvent.tenantId && this.dbManager) {
      try {
        const tenantDb = this.dbManager.getTenantDb(auditEvent.tenantId);
        if (tenantDb) {
          const tenantDoc = {
            id: auditEvent.id,
            action: auditEvent.action,
            userId: auditEvent.actor?.userId || null,
            actor: auditEvent.actor || {},
            resourceType: auditEvent.resource?.type || 'audit',
            resourceId: auditEvent.resource?.id || null,
            resource: auditEvent.resource || {},
            details: auditEvent.details || {},
            correlationId: auditEvent.correlationId || null,
            timestamp: auditEvent.timestamp || new Date()
          };
          await tenantDb.collection('audit_logs').insertOne(tenantDoc);
        }
      } catch (err) {
        // Continue even if tenant db is not reachable (platform event is authoritative)
      }
    }

    return new AuditEvent(auditEvent);
  }

  async findByCorrelationId(correlationId) {
    const cursor = this.collection.find({ correlationId });
    const docs = await cursor.toArray();
    return docs.map(d => new AuditEvent(d));
  }

  async findByUserId(userId, limit = 50) {
    const cursor = this.collection
      .find({ 'actor.userId': userId })
      .sort({ timestamp: -1 })
      .limit(limit);
    const docs = await cursor.toArray();
    return docs.map(d => new AuditEvent(d));
  }

  async findByTenantId(tenantId, { userId, action, limit = 50, offset = 0 } = {}) {
    if (!tenantId || !this.dbManager) return { items: [], total: 0 };
    const tenantDb = this.dbManager.getTenantDb(tenantId);
    const query = {};
    if (userId) query.userId = userId;
    if (action) query.action = action;
    const cursor = tenantDb.collection('audit_logs')
      .find(query)
      .sort({ timestamp: -1 })
      .skip(offset)
      .limit(limit);
    const [docs, total] = await Promise.all([
      cursor.toArray(),
      tenantDb.collection('audit_logs').countDocuments(query)
    ]);
    return { items: docs, total };
  }
}

module.exports = MongoAuditRepository;
