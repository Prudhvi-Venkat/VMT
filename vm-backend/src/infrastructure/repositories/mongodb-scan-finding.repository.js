'use strict';

const { ScanFindingRepository } = require('../../domain/interfaces/scan-repository.interface');
const { ScanFinding, ACTIVE_FINDING_STATUSES } = require('../../domain/entities/scan-finding.entity');
const { getDb } = require('../database/mongodb');

class MongoScanFindingRepository extends ScanFindingRepository {
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

  async saveMany(tenantId, scanId, findings = []) {
    if (!tenantId || !scanId) {
      throw new Error('tenantId and scanId are required to save scan findings');
    }
    const db = this._getDb(tenantId);
    if (!db || findings.length === 0) return findings;

    // Use deterministic unique filter (tenantId + scanId + componentId + cveId)
    const ops = findings.map(f => ({
      updateOne: {
        filter: {
          tenantId,
          scanId,
          componentId: f.componentId,
          cveId: f.cveId
        },
        update: {
          $set: {
            id: f.id,
            tenantId,
            scanId,
            projectId: f.projectId || null,
            assetId: f.assetId || null,
            componentId: f.componentId,
            vulnerabilityId: f.vulnerabilityId,
            cveId: f.cveId,
            aliases: f.aliases,
            componentSnapshot: f.componentSnapshot,
            vulnerabilitySnapshot: f.vulnerabilitySnapshot,
            versionEvidence: f.versionEvidence,
            match: f.match,
            status: f.status,
            risk: f.risk,
            sourceProvenance: f.sourceProvenance,
            remediation: f.remediation,
            assignedTo: f.assignedTo || null,
            assignedUserName: f.assignedUserName || null,
            assignedAt: f.assignedAt || null,
            assignedBy: f.assignedBy || null,
            availableActions: f.availableActions,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
          }
        },
        upsert: true
      }
    }));

    await db.collection('scanFindings').bulkWrite(ops);
    return findings;
  }

  async findByScanId(tenantId, scanId, {
    limit = 50,
    offset = 0,
    severity,
    status,
    ecosystem,
    packageName,
    cve,
    kev,
    minCvss,
    maxCvss,
    sort = 'cvss:desc'
  } = {}) {
    const db = this._getDb(tenantId);
    if (!db || !scanId) return { items: [], total: 0 };

    const query = { tenantId, scanId };
    if (severity) query['vulnerabilitySnapshot.severity'] = severity.toUpperCase();
    if (status) query.status = status.toUpperCase();
    if (ecosystem) query['componentSnapshot.ecosystem'] = ecosystem.toLowerCase();
    if (packageName) query['componentSnapshot.name'] = packageName;
    if (cve) query.cveId = { $regex: cve, $options: 'i' };
    if (kev !== undefined) query['vulnerabilitySnapshot.cisaKev'] = kev;
    if (minCvss !== undefined || maxCvss !== undefined) {
      query['vulnerabilitySnapshot.cvssScore'] = {};
      if (minCvss !== undefined) query['vulnerabilitySnapshot.cvssScore'].$gte = minCvss;
      if (maxCvss !== undefined) query['vulnerabilitySnapshot.cvssScore'].$lte = maxCvss;
    }

    const sortObj = {};
    if (sort === 'cvss:desc') sortObj['vulnerabilitySnapshot.cvssScore'] = -1;
    else if (sort === 'cvss:asc') sortObj['vulnerabilitySnapshot.cvssScore'] = 1;
    else if (sort === 'createdAt:desc') sortObj.createdAt = -1;
    else sortObj['vulnerabilitySnapshot.cvssScore'] = -1;

    const cursor = db.collection('scanFindings')
      .find(query)
      .sort(sortObj)
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      db.collection('scanFindings').countDocuments(query)
    ]);

    return {
      items: docs.map(d => new ScanFinding(d)),
      total
    };
  }

  async getFindingById(tenantId, findingId) {
    const db = this._getDb(tenantId);
    if (!db || !findingId) return null;

    const findingDoc = await db.collection('scanFindings').findOne({ id: findingId, tenantId });
    if (!findingDoc) return null;

    let history = [];
    try {
      history = await db.collection('finding_history')
        .find({ findingId, tenantId })
        .sort({ timestamp: -1 })
        .toArray();
    } catch (e) {}

    return {
      finding: new ScanFinding(findingDoc),
      history
    };
  }

  async findByTenant(tenantId, {
    limit = 100,
    offset = 0,
    severity,
    status,
    active,
    ecosystem,
    packageName,
    cve,
    vulnerability,
    search,
    projectId,
    kev,
    dateFrom,
    dateTo,
    sort = 'cvss:desc'
  } = {}) {
    const db = this._getDb(tenantId);
    if (!db || !tenantId) return { items: [], total: 0 };

    const query = { tenantId };
    if (severity) query['vulnerabilitySnapshot.severity'] = severity.toUpperCase();
    if (status) query.status = status.toUpperCase();
    else if (active) query.status = { $in: ACTIVE_FINDING_STATUSES };
    if (ecosystem) query['componentSnapshot.ecosystem'] = ecosystem.toLowerCase();
    if (packageName) query['componentSnapshot.name'] = packageName;
    if (cve) query.cveId = { $regex: cve, $options: 'i' };
    if (vulnerability) {
      query.$or = [
        { cveId: { $regex: vulnerability, $options: 'i' } },
        { vulnerabilityId: { $regex: vulnerability, $options: 'i' } },
        { aliases: { $regex: vulnerability, $options: 'i' } }
      ];
    }
    if (search) {
      const s = String(search).trim();
      query.$or = [
        { cveId: { $regex: s, $options: 'i' } },
        { vulnerabilityId: { $regex: s, $options: 'i' } },
        { 'componentSnapshot.name': { $regex: s, $options: 'i' } },
        { 'vulnerabilitySnapshot.title': { $regex: s, $options: 'i' } }
      ];
    }
    if (projectId) query.projectId = projectId;
    if (kev !== undefined) query['vulnerabilitySnapshot.cisaKev'] = Boolean(kev);
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const sortObj = {};
    if (sort === 'cvss:desc') sortObj['vulnerabilitySnapshot.cvssScore'] = -1;
    else if (sort === 'cvss:asc') sortObj['vulnerabilitySnapshot.cvssScore'] = 1;
    else if (sort === 'createdAt:desc') sortObj.createdAt = -1;
    else if (sort === 'risk:desc') sortObj['risk.score'] = -1;
    else sortObj['vulnerabilitySnapshot.cvssScore'] = -1;

    const cursor = db.collection('scanFindings')
      .find(query)
      .sort(sortObj)
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      db.collection('scanFindings').countDocuments(query)
    ]);

    return {
      items: docs.map(d => new ScanFinding(d)),
      total
    };
  }

  async countByScanId(tenantId, scanId, filters = {}) {
    const res = await this.findByScanId(tenantId, scanId, { limit: 1, offset: 0, ...filters });
    return res.total;
  }

  async getSummary(tenantId, scanId) {
    const db = this._getDb(tenantId);
    if (!db || !scanId) return { totalFindings: 0, severity: {} };

    const pipeline = [
      { $match: { tenantId, scanId } },
      { $group: { _id: '$vulnerabilitySnapshot.severity', count: { $sum: 1 } } }
    ];

    const results = await db.collection('scanFindings').aggregate(pipeline).toArray();
    const severity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    let totalFindings = 0;

    for (const r of results) {
      const s = (r._id || '').toLowerCase();
      if (severity[s] !== undefined) severity[s] += r.count;
      else severity.unknown += r.count;
      totalFindings += r.count;
    }

    return { totalFindings, severity };
  }

  async updateStatus(tenantId, findingId, { status, reason = '', comment = '', changedBy = 'usr_anonymous' }) {
    if (!tenantId) {
      const err = new Error('tenantId is required for tenant isolation');
      err.statusCode = 403;
      throw err;
    }
    const db = this._getDb(tenantId);
    if (!db) throw new Error('Tenant database unavailable');

    const finding = await db.collection('scanFindings').findOne({ id: findingId, tenantId });
    if (!finding) {
      const err = new Error(`Finding ${findingId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const previousStatus = finding.status;
    const { FindingLifecyclePolicy } = require('../../domain/policies/finding-lifecycle-policy');
    FindingLifecyclePolicy.validateTransition(previousStatus, status, { reason });
    const now = new Date();

    await db.collection('scanFindings').updateOne(
      { id: findingId, tenantId },
      { $set: { status: status.toUpperCase(), updatedAt: now } }
    );

    // Append to finding_history
    await db.collection('finding_history').insertOne({
      id: `fh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      findingId,
      previousStatus,
      newStatus: status.toUpperCase(),
      reason,
      comment,
      changedBy,
      timestamp: now
    });

    // Append to tenant audit_logs
    await db.collection('audit_logs').insertOne({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action: 'finding.status_updated',
      userId: changedBy,
      resourceType: 'finding',
      resourceId: findingId,
      details: {
        cveId: finding.cveId,
        previousStatus,
        newStatus: status.toUpperCase(),
        reason,
        comment
      },
      timestamp: now
    });

    return {
      findingId,
      previousStatus,
      newStatus: status.toUpperCase(),
      updatedAt: now
    };
  }

  async assignFinding(tenantId, findingId, { assignedTo, assignedUserName = '', assignedBy = 'usr_anonymous' }) {
    if (!tenantId) {
      const err = new Error('tenantId is required for tenant isolation');
      err.statusCode = 403;
      throw err;
    }
    const db = this._getDb(tenantId);
    if (!db) throw new Error('Tenant database unavailable');

    const finding = await db.collection('scanFindings').findOne({ id: findingId, tenantId });
    if (!finding) {
      const err = new Error(`Finding ${findingId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const previousAssignedTo = finding.assignedTo || null;
    const now = new Date();

    await db.collection('scanFindings').updateOne(
      { id: findingId, tenantId },
      {
        $set: {
          assignedTo,
          assignedUserName: assignedUserName || assignedTo,
          assignedAt: now,
          assignedBy,
          updatedAt: now
        }
      }
    );

    // Append to finding_history
    await db.collection('finding_history').insertOne({
      id: `fh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      findingId,
      action: 'ASSIGNED',
      previousAssignedTo,
      newAssignedTo: assignedTo,
      assignedUserName: assignedUserName || assignedTo,
      assignedBy,
      timestamp: now
    });

    // Append to tenant audit_logs
    await db.collection('audit_logs').insertOne({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action: 'finding.assigned',
      userId: assignedBy,
      resourceType: 'finding',
      resourceId: findingId,
      details: {
        cveId: finding.cveId,
        previousAssignedTo,
        assignedTo,
        assignedUserName: assignedUserName || assignedTo
      },
      timestamp: now
    });

    return {
      findingId,
      assignedTo,
      assignedUserName: assignedUserName || assignedTo,
      assignedAt: now,
      assignedBy
    };
  }

  async bulkUpdateStatus(tenantId, findingIds = [], { status, reason = '', changedBy = 'usr_anonymous' } = {}) {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new Error('Tenant database resolution failed: tenantId is required and must be non-empty');
    }
    if (!Array.isArray(findingIds) || findingIds.length === 0) return { modifiedCount: 0 };
    if (!status) throw new Error('status is required for bulk status update');

    const db = this._getDb(tenantId);
    if (!db) throw new Error('Tenant database unavailable');

    const now = new Date();
    const result = await db.collection('scanFindings').updateMany(
      { id: { $in: findingIds }, tenantId },
      { $set: { status: status.toUpperCase(), updatedAt: now } }
    );
    return { modifiedCount: result.modifiedCount || 0 };
  }
}

module.exports = MongoScanFindingRepository;
