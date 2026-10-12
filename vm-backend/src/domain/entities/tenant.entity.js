'use strict';

const TenantStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  DISABLED: 'DISABLED',
  PENDING: 'PENDING',
  DELETED: 'DELETED'
};

class Tenant {
  constructor({
    id,
    _id,
    tenantKey,
    name,
    displayName,
    status = TenantStatus.ACTIVE,
    databaseName = null,
    createdBy = null,
    createdAt = new Date(),
    updatedAt = new Date(),
    settings = {}
  }) {
    this.id = id || _id || tenantKey;
    this._id = this.id;
    this.tenantKey = tenantKey ? tenantKey.trim().toLowerCase() : '';
    this.name = name || this.tenantKey;
    this.displayName = displayName || this.name;
    this.status = status;
    this.databaseName = databaseName || `security_tenant_${this.tenantKey}`;
    this.createdBy = createdBy;
    this.createdAt = createdAt ? new Date(createdAt) : new Date();
    this.updatedAt = updatedAt ? new Date(updatedAt) : new Date();
    this.settings = {
      timezone: settings.timezone || 'UTC',
      dataRetentionDays: settings.dataRetentionDays || 365,
      scanningEnabled: settings.scanningEnabled !== false,
      ...settings
    };
  }

  isActive() {
    return this.status === TenantStatus.ACTIVE;
  }
}

module.exports = {
  Tenant,
  TenantStatus
};
