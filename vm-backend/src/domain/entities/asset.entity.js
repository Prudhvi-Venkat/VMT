'use strict';

const crypto = require('crypto');

const AssetType = Object.freeze({
  REPOSITORY: 'REPOSITORY',
  CONTAINER_IMAGE: 'CONTAINER_IMAGE',
  HOST: 'HOST',
  CLOUD_RESOURCE: 'CLOUD_RESOURCE',
  PACKAGE: 'PACKAGE',
  SERVICE: 'SERVICE'
});

const AssetCriticality = Object.freeze({
  TIER_1_CRITICAL: 'TIER_1_CRITICAL',
  TIER_2_HIGH: 'TIER_2_HIGH',
  TIER_3_MEDIUM: 'TIER_3_MEDIUM',
  TIER_4_LOW: 'TIER_4_LOW'
});

const AssetEnvironment = Object.freeze({
  PRODUCTION: 'PRODUCTION',
  STAGING: 'STAGING',
  DEVELOPMENT: 'DEVELOPMENT',
  TEST: 'TEST'
});

class Asset {
  constructor({
    id,
    tenantId,
    projectId = null,
    name,
    displayName = null,
    type = AssetType.REPOSITORY,
    criticality = AssetCriticality.TIER_3_MEDIUM,
    environment = AssetEnvironment.PRODUCTION,
    internetFacing = false,
    owner = {},
    identifiers = [],
    tags = {},
    stats = {},
    isActive = true,
    lastScannedAt = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    if (!tenantId) {
      throw new Error('Asset requires tenantId');
    }
    if (!name) {
      throw new Error('Asset requires name');
    }

    this.id = id || `ast_${crypto.randomUUID()}`;
    this.tenantId = tenantId;
    this.projectId = projectId;
    this.name = name.trim();
    this.displayName = displayName || this.name;
    this.type = (type || AssetType.REPOSITORY).toUpperCase();
    this.criticality = (criticality || AssetCriticality.TIER_3_MEDIUM).toUpperCase();
    this.environment = (environment || AssetEnvironment.PRODUCTION).toUpperCase();
    this.internetFacing = Boolean(internetFacing);
    this.owner = {
      email: owner?.email || null,
      teamId: owner?.teamId || null,
      businessUnit: owner?.businessUnit || null
    };
    this.identifiers = Array.isArray(identifiers) ? identifiers : [];
    this.tags = typeof tags === 'object' && tags !== null ? { ...tags } : {};
    this.stats = {
      openFindingsCount: stats?.openFindingsCount || 0,
      criticalCount: stats?.criticalCount || 0,
      highCount: stats?.highCount || 0,
      mediumCount: stats?.mediumCount || 0,
      lowCount: stats?.lowCount || 0,
      compositeRiskScore: stats?.compositeRiskScore || 0
    };
    this.isActive = isActive !== false;
    this.lastScannedAt = lastScannedAt ? new Date(lastScannedAt) : null;
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }

  toJSON() {
    return {
      id: this.id,
      tenantId: this.tenantId,
      projectId: this.projectId,
      name: this.name,
      displayName: this.displayName,
      type: this.type,
      criticality: this.criticality,
      environment: this.environment,
      internetFacing: this.internetFacing,
      owner: this.owner,
      identifiers: this.identifiers,
      tags: this.tags,
      stats: this.stats,
      isActive: this.isActive,
      lastScannedAt: this.lastScannedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

module.exports = {
  Asset,
  AssetType,
  AssetCriticality,
  AssetEnvironment
};
