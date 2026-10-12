'use strict';

const { ScanRepository } = require('../../domain/interfaces/scan-repository.interface');
const { Scan, ACTIVE_SCAN_STATUSES } = require('../../domain/entities/scan.entity');
const { getDb } = require('../database/mongodb');

class MongoScanRepository extends ScanRepository {
  constructor(db) {
    super();
    this._db = db;
  }

  _getDb(tenantId) {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new Error('Tenant database resolution failed: tenantId is required and must be non-empty');
    }
    if (this._db) return this._db;
    try {
      const { tenantDbManager } = require('../database/tenant-database-manager');
      const db = tenantDbManager.getTenantDb(tenantId);
      if (!db) {
        throw new Error(`Tenant database not found for tenant: ${tenantId}`);
      }
      return db;
    } catch (err) {
      throw new Error(`Tenant database resolution failed: ${err.message}`);
    }
  }

  async save(scan) {
    if (!scan || !scan.tenantId) {
      throw new Error('Tenant database resolution failed: scan must contain tenantId');
    }
    const db = this._getDb(scan.tenantId);
    if (!db) throw new Error('Database connection unavailable');
    const doc = {
      _id: scan.id,
      id: scan.id,
      tenantId: scan.tenantId,
      createdBy: scan.createdBy,
      projectId: scan.projectId,
      assetId: scan.assetId,
      name: scan.name,
      originalFileName: scan.originalFileName,
      fileType: scan.fileType,
      fileSize: scan.fileSize,
      checksum: scan.checksum,
      status: scan.status,
      componentCount: scan.componentCount,
      vulnerableComponentCount: scan.vulnerableComponentCount,
      findingCount: scan.findingCount,
      criticalCount: scan.criticalCount,
      highCount: scan.highCount,
      mediumCount: scan.mediumCount,
      lowCount: scan.lowCount,
      unknownCount: scan.unknownCount,
      warningCount: scan.warningCount,
      errorCount: scan.errorCount,
      warnings: scan.warnings,
      errors: scan.errors,
      progress: scan.progress,
      error: scan.error,
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt
    };

    await db.collection('scans').updateOne(
      { _id: scan.id, tenantId: scan.tenantId },
      { $set: doc },
      { upsert: true }
    );

    return scan;
  }

  async findById(tenantId, scanId) {
    const db = this._getDb(tenantId);
    if (!db || !scanId) return null;
    const doc = await db.collection('scans').findOne({ id: scanId, tenantId });
    if (!doc) return null;
    return new Scan(doc);
  }

  async update(tenantId, scanId, updates) {
    const db = this._getDb(tenantId);
    if (!db || !scanId) return null;
    const updateDoc = { ...updates, updatedAt: new Date() };
    await db.collection('scans').updateOne(
      { id: scanId, tenantId },
      { $set: updateDoc }
    );
    return this.findById(tenantId, scanId);
  }

  async findByTenant(tenantId, { limit = 20, offset = 0, status, projectId, active, sort = 'createdAt:desc' } = {}) {
    const db = this._getDb(tenantId);
    if (!db) return { items: [], total: 0 };
    const query = { tenantId };
    if (status) query.status = status;
    else if (active) query.status = { $in: ACTIVE_SCAN_STATUSES };
    if (projectId) query.projectId = projectId;

    const sortDir = sort.includes(':asc') ? 1 : -1;
    const cursor = db.collection('scans')
      .find(query)
      .sort({ createdAt: sortDir })
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      db.collection('scans').countDocuments(query)
    ]);

    return {
      items: docs.map(d => new Scan(d)),
      total
    };
  }
}

module.exports = MongoScanRepository;
