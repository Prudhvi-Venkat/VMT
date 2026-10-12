'use strict';

const { ScanRepository } = require('../../domain/interfaces/scan-repository.interface');
const { Scan, ACTIVE_SCAN_STATUSES } = require('../../domain/entities/scan.entity');

class MemoryScanRepository extends ScanRepository {
  constructor() {
    super();
    this.scans = new Map(); // key: `${tenantId}:${id}` -> Scan
  }

  async save(scan) {
    if (!scan.tenantId || !scan.id) {
      throw new Error('TenantId and Scan ID required');
    }
    const key = `${scan.tenantId}:${scan.id}`;
    this.scans.set(key, scan);
    return scan;
  }

  async findById(tenantId, scanId) {
    if (!tenantId || !scanId) return null;
    const key = `${tenantId}:${scanId}`;
    return this.scans.get(key) || null;
  }

  async update(tenantId, scanId, updates) {
    const scan = await this.findById(tenantId, scanId);
    if (!scan) return null;

    Object.assign(scan, updates, { updatedAt: new Date() });
    return scan;
  }

  async findByTenant(tenantId, { limit = 20, offset = 0, status, projectId, active, sort = 'createdAt:desc' } = {}) {
    if (!tenantId) return { items: [], total: 0 };

    let items = Array.from(this.scans.values()).filter(s => s.tenantId === tenantId);
    if (projectId) {
      items = items.filter(s => s.projectId === projectId);
    }
    if (status) {
      items = items.filter(s => s.status === status);
    } else if (active) {
      items = items.filter(s => ACTIVE_SCAN_STATUSES.includes(s.status));
    }

    if (sort === 'createdAt:desc') {
      items.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sort === 'createdAt:asc') {
      items.sort((a, b) => a.createdAt - b.createdAt);
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }
}

module.exports = MemoryScanRepository;
