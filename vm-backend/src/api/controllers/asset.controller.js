'use strict';

class AssetController {
  constructor(assetService) {
    this.assetService = assetService;
  }

  async listAssets(req, res, next) {
    try {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const {
        limit = 50,
        offset = 0,
        type,
        criticality,
        environment,
        search,
        projectId,
        isActive
      } = req.query;

      const result = await this.assetService.listAssets(tenantId, {
        limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 50)),
        offset: Math.max(0, parseInt(offset, 10) || 0),
        type,
        criticality,
        environment,
        search,
        projectId,
        isActive: isActive !== undefined ? isActive === 'true' : true
      });

      res.status(200).json({
        data: result.items,
        pagination: {
          limit: parseInt(limit, 10) || 50,
          offset: parseInt(offset, 10) || 0,
          total: result.total
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getAsset(req, res, next) {
    try {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const { assetId } = req.params;

      const asset = await this.assetService.getAssetById(tenantId, assetId);
      if (!asset) {
        return res.status(404).json({
          error: {
            code: 'ASSET_NOT_FOUND',
            message: `Asset with ID '${assetId}' not found`,
            requestId: req.id
          }
        });
      }

      res.status(200).json({ data: asset });
    } catch (err) {
      next(err);
    }
  }

  async createAsset(req, res, next) {
    try {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const actorUserId = req.principal?.userId || 'usr_anonymous';
      const correlationId = req.id;

      const asset = await this.assetService.createAsset(
        tenantId,
        req.body,
        { actorUserId, correlationId }
      );

      res.status(201).json({
        message: 'Asset registered successfully',
        data: asset
      });
    } catch (err) {
      next(err);
    }
  }

  async updateAsset(req, res, next) {
    try {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const { assetId } = req.params;
      const actorUserId = req.principal?.userId || 'usr_anonymous';
      const correlationId = req.id;

      const updated = await this.assetService.updateAsset(
        tenantId,
        assetId,
        req.body,
        { actorUserId, correlationId }
      );

      res.status(200).json({
        message: 'Asset updated successfully',
        data: updated
      });
    } catch (err) {
      next(err);
    }
  }

  async deleteAsset(req, res, next) {
    try {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const { assetId } = req.params;
      const actorUserId = req.principal?.userId || 'usr_anonymous';
      const correlationId = req.id;

      await this.assetService.deleteAsset(
        tenantId,
        assetId,
        { actorUserId, correlationId }
      );

      res.status(200).json({
        message: 'Asset deactivated successfully',
        data: { assetId, isActive: false }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = AssetController;
