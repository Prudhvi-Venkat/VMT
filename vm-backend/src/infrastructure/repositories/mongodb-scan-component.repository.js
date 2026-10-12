'use strict';

const { ScanComponentRepository } = require('../../domain/interfaces/scan-repository.interface');
const { ScanComponent } = require('../../domain/entities/scan-component.entity');
const { getDb } = require('../database/mongodb');

class MongoScanComponentRepository extends ScanComponentRepository {
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

  async saveMany(tenantId, scanId, components = []) {
    if (!tenantId || !scanId) {
      throw new Error('tenantId and scanId are required to save scan components');
    }
    const db = this._getDb(tenantId);
    if (!db || components.length === 0) return components;

    const ops = components.map(c => ({
      updateOne: {
        filter: { id: c.id, tenantId, scanId },
        update: {
          $set: {
            id: c.id,
            tenantId,
            scanId,
            name: c.name,
            namespace: c.namespace,
            vendor: c.vendor,
            ecosystem: c.ecosystem,
            packageManager: c.packageManager,
            componentType: c.componentType,
            declaredVersion: c.declaredVersion,
            resolvedVersion: c.resolvedVersion,
            versionConstraint: c.versionConstraint,
            version: c.version,
            purl: c.purl,
            cpe: c.cpe,
            scope: c.scope,
            directDependency: c.directDependency,
            dependencyDepth: c.dependencyDepth,
            vulnerabilitiesCount: c.vulnerabilitiesCount,
            vulnerable: c.vulnerable,
            resolutionStatus: c.resolutionStatus,
            resolutionMethod: c.resolutionMethod,
            resolutionConfidence: c.resolutionConfidence,
            sourceFile: c.sourceFile,
            sourceLocation: c.sourceLocation,
            sourceFormat: c.sourceFormat,
            hashes: c.hashes,
            metadata: c.metadata,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
          }
        },
        upsert: true
      }
    }));

    await db.collection('scanComponents').bulkWrite(ops);
    return components;
  }

  async findByScanId(tenantId, scanId, { limit = 50, offset = 0, vulnerable, ecosystem } = {}) {
    const db = this._getDb(tenantId);
    if (!db || !scanId) return { items: [], total: 0 };

    const query = { tenantId, scanId };
    if (vulnerable !== undefined) query.vulnerable = vulnerable;
    if (ecosystem) query.ecosystem = ecosystem.toLowerCase();

    const cursor = db.collection('scanComponents')
      .find(query)
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      db.collection('scanComponents').countDocuments(query)
    ]);

    return {
      items: docs.map(d => new ScanComponent(d)),
      total
    };
  }

  async countByScanId(tenantId, scanId, filters = {}) {
    const res = await this.findByScanId(tenantId, scanId, { limit: 1, offset: 0, ...filters });
    return res.total;
  }
}

module.exports = MongoScanComponentRepository;
