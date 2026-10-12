'use strict';

const { Tenant } = require('../../domain/entities/tenant.entity');

class MemoryTenantRepository {
  constructor() {
    this.tenants = new Map();
  }

  async save(tenant) {
    const cleanKey = tenant.tenantKey ? tenant.tenantKey.trim().toLowerCase() : null;
    const doc = {
      _id: tenant.id || cleanKey,
      id: tenant.id || cleanKey,
      tenantKey: cleanKey || tenant.tenantKey,
      name: tenant.name,
      displayName: tenant.displayName || tenant.name,
      status: tenant.status || 'ACTIVE',
      databaseName: tenant.databaseName || `vm_tenant_${cleanKey}`,
      createdBy: tenant.createdBy,
      createdAt: tenant.createdAt || new Date(),
      updatedAt: tenant.updatedAt || new Date(),
      settings: tenant.settings || {}
    };

    const instance = new Tenant(doc);
    if (cleanKey) {
      this.tenants.set(cleanKey, instance);
    }
    if (doc.id) {
      this.tenants.set(doc.id, instance);
    }
    return instance;
  }

  async update(tenant) {
    return this.save(tenant);
  }

  async findByKey(tenantKey) {
    if (!tenantKey) return null;
    const clean = tenantKey.trim().toLowerCase();
    return this.tenants.get(clean) || null;
  }

  async findById(id) {
    if (!id) return null;
    return this.tenants.get(id) || this.tenants.get(id.toLowerCase()) || null;
  }

  async listAll({ status, limit = 50, offset = 0 } = {}) {
    const all = Array.from(new Set(this.tenants.values()));
    const filtered = status ? all.filter(t => t.status === status) : all;
    return {
      items: filtered.slice(offset, offset + limit),
      total: filtered.length
    };
  }

  async updateStatus(tenantKey, status) {
    const existing = await this.findByKey(tenantKey);
    if (!existing) return null;
    existing.status = status;
    existing.updatedAt = new Date();
    await this.save(existing);
    return existing;
  }
}

module.exports = MemoryTenantRepository;
