'use strict';

const express = require('express');
const AssetValidator = require('../validators/asset.validator');

function createAssetRoutes({
  assetController,
  authenticateMiddleware,
  authorizeMiddleware
}) {
  const router = express.Router();

  // All asset routes require authentication
  router.use(authenticateMiddleware);

  function requireTenantContext(req, res, next) {
    const tenantId = req.principal?.tenantId || req.tenantId;
    if (!tenantId && !req.principal?.isPlatformScope()) {
      return res.status(403).json({
        error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'Tenant context required for asset operations', requestId: req.id }
      });
    }
    next();
  }

  router.use(requireTenantContext);

  // List assets
  router.get(
    '/',
    authorizeMiddleware.requirePermission('assets:read'),
    (req, res, next) => assetController.listAssets(req, res, next)
  );

  // Get asset by ID
  router.get(
    '/:assetId',
    authorizeMiddleware.requirePermission('assets:read'),
    (req, res, next) => assetController.getAsset(req, res, next)
  );

  // Create asset
  router.post(
    '/',
    authorizeMiddleware.requirePermission('assets:create'),
    AssetValidator.validateCreateAsset,
    (req, res, next) => assetController.createAsset(req, res, next)
  );

  // Update asset
  router.patch(
    '/:assetId',
    authorizeMiddleware.requirePermission('assets:update'),
    AssetValidator.validateUpdateAsset,
    authorizeMiddleware.evaluatePolicy('assets:update', async (req) => {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const asset = assetController.assetService ? await assetController.assetService.getAssetById(tenantId, req.params.assetId) : null;
      if (!asset) return { type: 'asset', id: req.params.assetId, tenantId };
      return {
        type: 'asset',
        id: asset.id,
        tenantId,
        criticality: asset.criticality,
        status: asset.status,
        lifecycleState: asset.lifecycleState || asset.status
      };
    }),
    (req, res, next) => assetController.updateAsset(req, res, next)
  );

  // Delete / deactivate asset
  router.delete(
    '/:assetId',
    authorizeMiddleware.requirePermission('assets:delete'),
    authorizeMiddleware.evaluatePolicy('assets:delete', async (req) => {
      const tenantId = req.tenantId || req.principal?.tenantId;
      const asset = assetController.assetService ? await assetController.assetService.getAssetById(tenantId, req.params.assetId) : null;
      if (!asset) return { type: 'asset', id: req.params.assetId, tenantId };
      return {
        type: 'asset',
        id: asset.id,
        tenantId,
        criticality: asset.criticality,
        status: asset.status,
        lifecycleState: asset.lifecycleState || asset.status
      };
    }),
    (req, res, next) => assetController.deleteAsset(req, res, next)
  );

  return router;
}

module.exports = createAssetRoutes;
