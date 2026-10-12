'use strict';

const AssetRepository = require('../../domain/interfaces/asset-repository.interface');
const { Asset } = require('../../domain/entities/asset.entity');

class MongoAssetRepository extends AssetRepository {
  constructor(tenantDbManager) {
    super();
    this.tenantDbManager = tenantDbManager;
  }

  _getDb(tenantId) {
    return this.tenantDbManager.getTenantDb(tenantId);
  }

  async save(tenantId, asset) {
    if (!tenantId || !asset) throw new Error('tenantId and asset are required');
    const db = this._getDb(tenantId);
    if (!db) throw new Error('Tenant database unavailable');

    const doc = asset.toJSON ? asset.toJSON() : asset;
    await db.collection('assets').updateOne(
      { id: asset.id },
      { $set: doc },
      { upsert: true }
    );
    return asset;
  }

  async findById(tenantId, assetId) {
    if (!tenantId || !assetId) return null;
    const db = this._getDb(tenantId);
    if (!db) return null;

    const doc = await db.collection('assets').findOne({ id: assetId, tenantId });
    if (!doc) return null;
    return new Asset(doc);
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
    const db = this._getDb(tenantId);
    if (!db) return { items: [], total: 0 };

    const query = { tenantId };
    if (isActive !== undefined) query.isActive = isActive;
    if (type) query.type = type.toUpperCase();
    if (criticality) query.criticality = criticality.toUpperCase();
    if (environment) query.environment = environment.toUpperCase();
    if (projectId) query.projectId = projectId;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { displayName: { $regex: search, $options: 'i' } },
        { identifiers: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await db.collection('assets').countDocuments(query);
    const docs = await db.collection('assets')
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    return {
      items: docs.map(d => new Asset(d)),
      total
    };
  }

  async update(tenantId, assetId, updates = {}) {
    if (!tenantId || !assetId) return null;
    const db = this._getDb(tenantId);
    if (!db) return null;

    const ALLOWED_ASSET_FIELDS = [
      'name', 'type', 'criticality', 'environment', 'owner', 'tags',
      'metadata', 'ipAddress', 'hostname', 'macAddress', 'status',
      'isActive', 'projectId'
    ];
    const setPayload = { updatedAt: new Date() };
    for (const key of ALLOWED_ASSET_FIELDS) {
      if (updates && updates[key] !== undefined) {
        setPayload[key] = updates[key];
      }
    }

    const result = await db.collection('assets').findOneAndUpdate(
      { id: assetId, tenantId },
      { $set: setPayload },
      { returnDocument: 'after' }
    );

    if (!result) return null;
    return new Asset(result);
  }

  async delete(tenantId, assetId) {
    return this.update(tenantId, assetId, { isActive: false });
  }

  async findByIdentifier(tenantId, identifier) {
    if (!tenantId || !identifier) return null;
    const db = this._getDb(tenantId);
    if (!db) return null;

    const doc = await db.collection('assets').findOne({
      tenantId,
      $or: [
        { identifiers: identifier },
        { name: identifier }
      ]
    });

    if (!doc) return null;
    return new Asset(doc);
  }
}

module.exports = MongoAssetRepository;
