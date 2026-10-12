'use strict';

/**
 * Repository interface contracts for Scan persistence with tenant isolation
 */
class ScanRepository {
  async save(scan) { throw new Error('Not implemented'); }
  async findById(tenantId, scanId) { throw new Error('Not implemented'); }
  async update(tenantId, scanId, updates) { throw new Error('Not implemented'); }
  async findByTenant(tenantId, { limit, offset, status, sort }) { throw new Error('Not implemented'); }
}

class ScanComponentRepository {
  async saveMany(tenantId, scanId, components) { throw new Error('Not implemented'); }
  async findByScanId(tenantId, scanId, options) { throw new Error('Not implemented'); }
  async countByScanId(tenantId, scanId, filters) { throw new Error('Not implemented'); }
}

class ScanFindingRepository {
  async saveMany(tenantId, scanId, findings) { throw new Error('Not implemented'); }
  async findByScanId(tenantId, scanId, options) { throw new Error('Not implemented'); }
  async countByScanId(tenantId, scanId, filters) { throw new Error('Not implemented'); }
  async getSummary(tenantId, scanId) { throw new Error('Not implemented'); }
  async findByTenant(tenantId, options) { throw new Error('Not implemented'); }
  async getFindingById(tenantId, findingId) { throw new Error('Not implemented'); }
  async updateStatus(tenantId, findingId, statusData) { throw new Error('Not implemented'); }
  async bulkUpdateStatus(tenantId, findingIds, statusData) { throw new Error('Not implemented'); }
  async assignFinding(tenantId, findingId, assignmentData) { throw new Error('Not implemented'); }
}

module.exports = {
  ScanRepository,
  ScanComponentRepository,
  ScanFindingRepository
};
