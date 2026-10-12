'use strict';

const { Tenant } = require('../../domain/entities/tenant.entity');
const { tenantDbManager } = require('../database/tenant-database-manager');

class MongoTenantRepository {
  constructor(dbManager = tenantDbManager) {
    this.dbManager = dbManager;
  }

  get collection() {
    return this.dbManager.getPlatformDb().collection('tenants');
  }

  async save(tenant) {
    const doc = {
      _id: tenant.id || tenant.tenantKey,
      id: tenant.id || tenant.tenantKey,
      tenantKey: tenant.tenantKey,
      name: tenant.name,
      displayName: tenant.displayName,
      status: tenant.status,
      databaseName: tenant.databaseName,
      createdBy: tenant.createdBy,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      settings: tenant.settings
    };

    await this.collection.updateOne(
      { tenantKey: tenant.tenantKey },
      { $set: doc },
      { upsert: true }
    );

    return new Tenant(doc);
  }

  async update(tenant) {
    return this.save(tenant);
  }

  async findByKey(tenantKey) {
    if (!tenantKey) return null;
    const clean = tenantKey.trim().toLowerCase();
    const doc = await this.collection.findOne({ tenantKey: clean });
    return doc ? new Tenant(doc) : null;
  }

  async findById(id) {
    if (!id) return null;
    const doc = await this.collection.findOne({ $or: [{ _id: id }, { id }, { tenantKey: id.toLowerCase() }] });
    return doc ? new Tenant(doc) : null;
  }

  async listAll({ status, limit = 50, offset = 0 } = {}) {
    const query = {};
    if (status) query.status = status;

    const cursor = this.collection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit);

    const [docs, total] = await Promise.all([
      cursor.toArray(),
      this.collection.countDocuments(query)
    ]);

    return {
      items: docs.map(d => new Tenant(d)),
      total
    };
  }

  async updateStatus(tenantKey, status) {
    const clean = tenantKey.trim().toLowerCase();
    await this.collection.updateOne(
      { tenantKey: clean },
      { $set: { status, updatedAt: new Date() } }
    );
    return this.findByKey(clean);
  }
}

module.exports = MongoTenantRepository;
