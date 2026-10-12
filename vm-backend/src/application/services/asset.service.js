'use strict';

const { Asset } = require('../../domain/entities/asset.entity');
const { DomainEvent, eventBus, EVENT_TYPES } = require('../../events');

class AssetService {
  constructor({
    assetRepository,
    auditService = null,
    eventBusInstance = eventBus
  }) {
    this.assetRepository = assetRepository;
    this.auditService = auditService;
    this.eventBus = eventBusInstance;
  }

  async createAsset(tenantId, {
    projectId = null,
    name,
    displayName = null,
    type = 'REPOSITORY',
    criticality = 'TIER_3_MEDIUM',
    environment = 'PRODUCTION',
    internetFacing = false,
    owner = {},
    identifiers = [],
    tags = {}
  }, { actorUserId = 'usr_anonymous', correlationId = null } = {}) {
    if (!tenantId) throw new Error('Tenant context required for asset creation');
    if (!name || name.trim().length === 0) throw new Error('Asset name is required');

    const asset = new Asset({
      tenantId,
      projectId,
      name,
      displayName,
      type,
      criticality,
      environment,
      internetFacing,
      owner,
      identifiers,
      tags
    });

    await this.assetRepository.save(tenantId, asset);

    if (this.auditService) {
      await this.auditService.recordEvent({
        actor: { userId: actorUserId },
        action: 'asset.created',
        resource: { type: 'asset', id: asset.id },
        details: { name: asset.name, type: asset.type, criticality: asset.criticality, projectId },
        correlationId
      });
    }

    if (this.eventBus) {
      await this.eventBus.publish(new DomainEvent({
        eventType: EVENT_TYPES.ASSET_CREATED,
        tenantId,
        correlationId,
        payload: {
          assetId: asset.id,
          name: asset.name,
          type: asset.type,
          criticality: asset.criticality,
          projectId: asset.projectId
        }
      }));
    }

    return asset;
  }

  async getAssetById(tenantId, assetId) {
    if (!tenantId || !assetId) return null;
    return this.assetRepository.findById(tenantId, assetId);
  }

  async listAssets(tenantId, options = {}) {
    if (!tenantId) return { items: [], total: 0 };
    return this.assetRepository.findByTenant(tenantId, options);
  }

  async updateAsset(tenantId, assetId, updates = {}, { actorUserId = 'usr_anonymous', correlationId = null } = {}) {
    if (!tenantId || !assetId) throw new Error('tenantId and assetId required');

    const existing = await this.assetRepository.findById(tenantId, assetId);
    if (!existing) {
      const err = new Error(`Asset ${assetId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const updated = await this.assetRepository.update(tenantId, assetId, updates);

    if (this.auditService) {
      await this.auditService.recordEvent({
        actor: { userId: actorUserId },
        action: 'asset.updated',
        resource: { type: 'asset', id: assetId },
        details: updates,
        correlationId
      });
    }

    if (this.eventBus) {
      await this.eventBus.publish(new DomainEvent({
        eventType: EVENT_TYPES.ASSET_UPDATED,
        tenantId,
        correlationId,
        payload: {
          assetId,
          updates
        }
      }));
    }

    return updated;
  }

  async deleteAsset(tenantId, assetId, { actorUserId = 'usr_anonymous', correlationId = null } = {}) {
    if (!tenantId || !assetId) throw new Error('tenantId and assetId required');

    const deleted = await this.assetRepository.delete(tenantId, assetId);

    if (this.auditService) {
      await this.auditService.recordEvent({
        actor: { userId: actorUserId },
        action: 'asset.deleted',
        resource: { type: 'asset', id: assetId },
        details: { assetId },
        correlationId
      });
    }

    if (this.eventBus) {
      await this.eventBus.publish(new DomainEvent({
        eventType: EVENT_TYPES.ASSET_DELETED,
        tenantId,
        correlationId,
        payload: { assetId }
      }));
    }

    return deleted;
  }

  /**
   * Correlates scan results into the asset inventory, updating stats and timestamps
   */
  async correlateScanToAsset(tenantId, {
    scanId,
    projectId,
    assetId = null,
    targetName = 'unknown',
    openFindingsCount = 0,
    criticalCount = 0,
    highCount = 0,
    riskScore = 0
  }) {
    let targetAsset = null;
    if (assetId) {
      targetAsset = await this.assetRepository.findById(tenantId, assetId);
    }
    if (!targetAsset && targetName) {
      targetAsset = await this.assetRepository.findByIdentifier(tenantId, targetName);
    }

    if (targetAsset) {
      await this.assetRepository.update(tenantId, targetAsset.id, {
        lastScannedAt: new Date(),
        stats: {
          openFindingsCount,
          criticalCount,
          highCount,
          compositeRiskScore: riskScore
        }
      });
      return targetAsset;
    }

    // Automatically create asset record from scan target if not existing
    return this.createAsset(tenantId, {
      projectId,
      name: targetName,
      type: 'REPOSITORY',
      criticality: 'TIER_3_MEDIUM',
      environment: 'PRODUCTION',
      identifiers: [targetName]
    });
  }
}

module.exports = AssetService;
