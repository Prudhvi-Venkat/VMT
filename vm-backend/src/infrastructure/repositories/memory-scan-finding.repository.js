'use strict';

const { ScanFindingRepository } = require('../../domain/interfaces/scan-repository.interface');
const { ACTIVE_FINDING_STATUSES } = require('../../domain/entities/scan-finding.entity');

class MemoryScanFindingRepository extends ScanFindingRepository {
  constructor() {
    super();
    this.findings = new Map(); // key: `${tenantId}:${scanId}` -> Array<ScanFinding>
    this.findingHistory = new Map(); // key: findingId -> Array<Object>
  }

  async saveMany(tenantId, scanId, findings = []) {
    if (!tenantId || !scanId) throw new Error('tenantId and scanId required');
    const key = `${tenantId}:${scanId}`;
    const existing = this.findings.get(key) || [];

    // Deterministic deduplication
    const seen = new Set(existing.map(f => `${f.componentId}:${f.cveId}`));
    const newItems = [];
    for (const f of findings) {
      const dedup = `${f.componentId}:${f.cveId}`;
      if (!seen.has(dedup)) {
        seen.add(dedup);
        newItems.push(f);
      }
    }

    this.findings.set(key, [...existing, ...newItems]);
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
    if (!tenantId || !scanId) return { items: [], total: 0 };
    const key = `${tenantId}:${scanId}`;
    let items = this.findings.get(key) || [];

    if (severity) {
      items = items.filter(f => f.vulnerabilitySnapshot.severity.toLowerCase() === severity.toLowerCase());
    }
    if (status) {
      items = items.filter(f => f.status.toLowerCase() === status.toLowerCase());
    }
    if (ecosystem) {
      items = items.filter(f => (f.componentSnapshot.ecosystem || '').toLowerCase() === ecosystem.toLowerCase());
    }
    if (packageName) {
      items = items.filter(f => (f.componentSnapshot.name || '').toLowerCase() === packageName.toLowerCase());
    }
    if (cve) {
      items = items.filter(f => (f.cveId || '').toLowerCase().includes(cve.toLowerCase()));
    }
    if (kev !== undefined) {
      items = items.filter(f => f.vulnerabilitySnapshot.cisaKev === kev);
    }
    if (minCvss !== undefined) {
      items = items.filter(f => (f.vulnerabilitySnapshot.cvssScore || 0) >= minCvss);
    }
    if (maxCvss !== undefined) {
      items = items.filter(f => (f.vulnerabilitySnapshot.cvssScore || 0) <= maxCvss);
    }

    // Sorting
    if (sort === 'cvss:desc') {
      items.sort((a, b) => (b.vulnerabilitySnapshot.cvssScore || 0) - (a.vulnerabilitySnapshot.cvssScore || 0));
    } else if (sort === 'cvss:asc') {
      items.sort((a, b) => (a.vulnerabilitySnapshot.cvssScore || 0) - (b.vulnerabilitySnapshot.cvssScore || 0));
    } else if (sort === 'createdAt:desc') {
      items.sort((a, b) => b.createdAt - a.createdAt);
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async countByScanId(tenantId, scanId, filters = {}) {
    const res = await this.findByScanId(tenantId, scanId, { limit: 999999, offset: 0, ...filters });
    return res.total;
  }

  async getSummary(tenantId, scanId) {
    const { items: all } = await this.findByScanId(tenantId, scanId, { limit: 999999, offset: 0 });
    const severity = { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
    for (const f of all) {
      const s = (f.vulnerabilitySnapshot.severity || '').toLowerCase();
      if (severity[s] !== undefined) severity[s]++;
      else severity.unknown++;
    }
    return {
      totalFindings: all.length,
      severity
    };
  }

  async getFindingById(tenantId, findingId) {
    if (!tenantId || !findingId) return null;
    for (const [key, list] of this.findings.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        const found = list.find(f => f.id === findingId);
        if (found) {
          return { finding: found, history: this.findingHistory.get(findingId) || [] };
        }
      }
    }
    return null;
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
    if (!tenantId) return { items: [], total: 0 };
    let all = [];
    for (const [key, list] of this.findings.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        all.push(...list);
      }
    }

    if (severity) {
      all = all.filter(f => (f.vulnerabilitySnapshot?.severity || '').toLowerCase() === severity.toLowerCase());
    }
    if (status) {
      all = all.filter(f => (f.status || '').toLowerCase() === status.toLowerCase());
    } else if (active) {
      const activeSet = ACTIVE_FINDING_STATUSES.map(s => s.toLowerCase());
      all = all.filter(f => activeSet.includes((f.status || '').toLowerCase()));
    }
    if (ecosystem) {
      all = all.filter(f => (f.componentSnapshot?.ecosystem || '').toLowerCase() === ecosystem.toLowerCase());
    }
    if (packageName) {
      all = all.filter(f => (f.componentSnapshot?.name || '').toLowerCase() === packageName.toLowerCase());
    }
    if (cve) {
      all = all.filter(f => (f.cveId || '').toLowerCase().includes(cve.toLowerCase()));
    }
    if (vulnerability) {
      const v = vulnerability.toLowerCase();
      all = all.filter(f =>
        (f.cveId || '').toLowerCase().includes(v) ||
        (f.vulnerabilityId || '').toLowerCase().includes(v) ||
        (Array.isArray(f.aliases) && f.aliases.some(a => (a || '').toLowerCase().includes(v)))
      );
    }
    if (search) {
      const s = search.toLowerCase();
      all = all.filter(f =>
        (f.cveId || '').toLowerCase().includes(s) ||
        (f.vulnerabilityId || '').toLowerCase().includes(s) ||
        (f.componentSnapshot?.name || '').toLowerCase().includes(s) ||
        (f.vulnerabilitySnapshot?.title || '').toLowerCase().includes(s)
      );
    }
    if (projectId) {
      all = all.filter(f => f.projectId === projectId);
    }
    if (kev !== undefined) {
      all = all.filter(f => Boolean(f.vulnerabilitySnapshot?.cisaKev) === Boolean(kev));
    }
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      all = all.filter(f => f.createdAt && new Date(f.createdAt).getTime() >= fromTime);
    }
    if (dateTo) {
      const toTime = new Date(dateTo).getTime();
      all = all.filter(f => f.createdAt && new Date(f.createdAt).getTime() <= toTime);
    }

    if (sort === 'cvss:desc') {
      all.sort((a, b) => (b.vulnerabilitySnapshot?.cvssScore || 0) - (a.vulnerabilitySnapshot?.cvssScore || 0));
    } else if (sort === 'createdAt:desc') {
      all.sort((a, b) => b.createdAt - a.createdAt);
    }

    const total = all.length;
    const items = all.slice(offset, offset + limit);
    return { items, total };
  }

  async updateStatus(tenantId, findingId, { status, reason = '', comment = '', changedBy = 'usr_anonymous' } = {}) {
    if (!tenantId || !findingId) throw new Error('tenantId and findingId required');
    const { FindingLifecyclePolicy } = require('../../domain/policies/finding-lifecycle-policy');

    for (const [key, list] of this.findings.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        const found = list.find(f => f.id === findingId);
        if (found) {
          const previousStatus = found.status;
          FindingLifecyclePolicy.validateTransition(previousStatus, status, { reason });
          
          found.status = status.toUpperCase();
          found.updatedAt = new Date();

          const hist = this.findingHistory.get(findingId) || [];
          hist.push({
            id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            findingId,
            tenantId,
            previousStatus,
            newStatus: found.status,
            reason,
            comment,
            changedBy,
            timestamp: found.updatedAt
          });
          this.findingHistory.set(findingId, hist);

          return {
            findingId,
            previousStatus,
            newStatus: found.status,
            updatedAt: found.updatedAt
          };
        }
      }
    }
    const err = new Error(`Finding ${findingId} not found`);
    err.statusCode = 404;
    throw err;
  }

  async assignFinding(tenantId, findingId, { assignedTo, assignedUserName = '', assignedBy = 'usr_anonymous' } = {}) {
    if (!tenantId || !findingId) throw new Error('tenantId and findingId required');

    for (const [key, list] of this.findings.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        const found = list.find(f => f.id === findingId);
        if (found) {
          const previousAssignedTo = found.assignedTo || null;
          const now = new Date();
          found.assignedTo = assignedTo;
          found.assignedUserName = assignedUserName || assignedTo;
          found.assignedAt = now;
          found.assignedBy = assignedBy;
          found.updatedAt = now;

          const hist = this.findingHistory.get(findingId) || [];
          hist.push({
            id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            findingId,
            tenantId,
            action: 'ASSIGNMENT',
            previousAssignedTo,
            assignedTo,
            assignedUserName: found.assignedUserName,
            assignedBy,
            timestamp: now
          });
          this.findingHistory.set(findingId, hist);

          return {
            findingId,
            previousAssignedTo,
            assignedTo,
            assignedUserName: found.assignedUserName,
            assignedAt: now
          };
        }
      }
    }
    const err = new Error(`Finding ${findingId} not found`);
    err.statusCode = 404;
    throw err;
  }

  async bulkUpdateStatus(tenantId, findingIds = [], { status, reason = '', changedBy = 'usr_anonymous' } = {}) {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new Error('tenantId is required for tenant isolation');
    }
    if (!Array.isArray(findingIds) || findingIds.length === 0) return { modifiedCount: 0 };
    if (!status) throw new Error('status is required for bulk status update');

    let modifiedCount = 0;
    const now = new Date();
    for (const [key, list] of this.findings.entries()) {
      if (key.startsWith(`${tenantId}:`)) {
        for (const item of list) {
          if (findingIds.includes(item.id)) {
            item.status = status.toUpperCase();
            item.updatedAt = now;
            modifiedCount++;
          }
        }
      }
    }
    return { modifiedCount };
  }
}

module.exports = MemoryScanFindingRepository;

