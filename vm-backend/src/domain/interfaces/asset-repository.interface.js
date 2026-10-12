'use strict';

class AssetRepository {
  async save(tenantId, asset) { throw new Error('Not implemented'); }
  async findById(tenantId, assetId) { throw new Error('Not implemented'); }
  async findByTenant(tenantId, options = {}) { throw new Error('Not implemented'); }
  async update(tenantId, assetId, updates) { throw new Error('Not implemented'); }
  async delete(tenantId, assetId) { throw new Error('Not implemented'); }
  async findByIdentifier(tenantId, identifier) { throw new Error('Not implemented'); }
}

module.exports = AssetRepository;
