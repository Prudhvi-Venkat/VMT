'use strict';

const AssetRepository = require('../../domain/interfaces/asset-repository.interface');
const { Asset } = require('../../domain/entities/asset.entity');

class MemoryAssetRepository extends AssetRepository {
  constructor() {
    super();
    this.assets = new Map(); // tenantId -> Map<assetId, Asset>
  }

  _getTenantStore(tenantId) {
    if (!this.assets.has(tenantId)) {
      this.assets.set(tenantId, new Map());
    }
    return this.assets.get(tenantId);
  }

  async save(tenantId, asset) {
    if (!tenantId || !asset) throw new Error('tenantId and asset are required');
    const store = this._getTenantStore(tenantId);
    store.set(asset.id, asset);
    return asset;
  }

  async findById(tenantId, assetId) {
    if (!tenantId || !assetId) return null;
    const store = this._getTenantStore(tenantId);
    return store.get(assetId) || null;
  }

  async findByTenant(tenantId, {
    limit = 50,
    offset = 0,
    type,
    criticality,
    environment,
    search,
    projectId,
    isActive = true
  } = {}) {
    if (!tenantId) return { items: [], total: 0 };
    const store = this._getTenantStore(tenantId);
    let items = Array.from(store.values());

    if (isActive !== undefined) {
      items = items.filter(a => a.isActive === isActive);
    }
    if (type) {
      items = items.filter(a => a.type.toLowerCase() === type.toLowerCase());
    }
    if (criticality) {
      items = items.filter(a => a.criticality.toLowerCase() === criticality.toLowerCase());
    }
    if (environment) {
      items = items.filter(a => a.environment.toLowerCase() === environment.toLowerCase());
    }
    if (projectId) {
      items = items.filter(a => a.projectId === projectId);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.displayName && a.displayName.toLowerCase().includes(q)) ||
        a.identifiers.some(id => String(id).toLowerCase().includes(q))
      );
    }

    items.sort((a, b) => b.createdAt - a.createdAt);

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);

    return { items: paginated, total };
  }

  async update(tenantId, assetId, updates = {}) {
    if (!tenantId || !assetId) return null;
    const asset = await this.findById(tenantId, assetId);
    if (!asset) return null;

    if (updates.displayName !== undefined) asset.displayName = updates.displayName;
    if (updates.criticality !== undefined) asset.criticality = updates.criticality.toUpperCase();
    if (updates.environment !== undefined) asset.environment = updates.environment.toUpperCase();
    if (updates.internetFacing !== undefined) asset.internetFacing = Boolean(updates.internetFacing);
    if (updates.owner !== undefined) asset.owner = { ...asset.owner, ...updates.owner };
    if (updates.tags !== undefined) asset.tags = { ...asset.tags, ...updates.tags };
    if (updates.stats !== undefined) asset.stats = { ...asset.stats, ...updates.stats };
    if (updates.lastScannedAt !== undefined) asset.lastScannedAt = new Date(updates.lastScannedAt);
    if (updates.isActive !== undefined) asset.isActive = Boolean(updates.isActive);
    asset.updatedAt = new Date();

    return asset;
  }

  async delete(tenantId, assetId) {
    return this.update(tenantId, assetId, { isActive: false });
  }

  async findByIdentifier(tenantId, identifier) {
    if (!tenantId || !identifier) return null;
    const store = this._getTenantStore(tenantId);
    for (const asset of store.values()) {
      if (asset.identifiers.includes(identifier) || asset.name === identifier) {
        return asset;
      }
    }
    return null;
  }
}

module.exports = MemoryAssetRepository;
