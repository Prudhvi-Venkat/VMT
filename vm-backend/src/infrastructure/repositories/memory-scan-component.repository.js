'use strict';

const { ScanComponentRepository } = require('../../domain/interfaces/scan-repository.interface');

class MemoryScanComponentRepository extends ScanComponentRepository {
  constructor() {
    super();
    this.components = new Map(); // key: `${tenantId}:${scanId}` -> Array<ScanComponent>
  }

  async saveMany(tenantId, scanId, components = []) {
    if (!tenantId || !scanId) throw new Error('tenantId and scanId required');
    const key = `${tenantId}:${scanId}`;
    const existing = this.components.get(key) || [];
    const map = new Map();
    for (const c of existing) {
      map.set(c.id || `${c.name}@${c.version}`, c);
    }
    for (const c of components) {
      map.set(c.id || `${c.name}@${c.version}`, c);
    }
    this.components.set(key, Array.from(map.values()));
    return components;
  }

  async findByScanId(tenantId, scanId, { limit = 50, offset = 0, vulnerable, ecosystem } = {}) {
    if (!tenantId || !scanId) return { items: [], total: 0 };
    const key = `${tenantId}:${scanId}`;
    let items = this.components.get(key) || [];

    if (vulnerable !== undefined) {
      items = items.filter(c => c.vulnerable === vulnerable);
    }
    if (ecosystem) {
      items = items.filter(c => c.ecosystem === ecosystem.toLowerCase());
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async countByScanId(tenantId, scanId, filters = {}) {
    const res = await this.findByScanId(tenantId, scanId, { limit: 999999, offset: 0, ...filters });
    return res.total;
  }
}

module.exports = MemoryScanComponentRepository;
