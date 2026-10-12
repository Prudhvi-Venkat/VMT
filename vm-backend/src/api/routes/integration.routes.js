'use strict';

const express = require('express');
const { createGuardHelpers } = require('./route-guards');
const IntegrationValidator = require('../validators/integration.validator');

function createIntegrationRoutes({ scmIntegrationService, authenticateMiddleware, authorizeMiddleware }) {
  const router = express.Router();
  router.use(authenticateMiddleware);

  function requireTenant(req, res, next) {
    if (!req.principal?.tenantId) return res.status(403).json({ error: { code: 'TENANT_REQUIRED', message: 'Tenant context required' } });
    next();
  }

  const { requirePermission } = createGuardHelpers(authorizeMiddleware);
  const requireManage = requirePermission('integrations:manage');
  const requireScan = requirePermission('scans:create');
  router.use(requireTenant);

  router.get('/', requireManage, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.listIntegrations(req.principal.tenantId, req.query.projectId || null);
      res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.post('/', requireManage, IntegrationValidator.validateCreateIntegration, async (req, res, next) => {
    try {
      const { type, provider, name, projectId, credentials, config } = req.body || {};
      const data = await scmIntegrationService.createIntegration(req.principal.tenantId, {
        type: type || provider,
        name,
        projectId,
        credentials,
        config
      }, req.principal.userId);
      res.status(201).json({ success: true, data, message: `${data.type} integration configured successfully` });
    } catch (err) { next(err); }
  });

  router.get('/:integrationId', requireManage, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.getIntegration(req.principal.tenantId, req.params.integrationId);
      if (!data) return res.status(404).json({ error: { code: 'INTEGRATION_NOT_FOUND', message: 'Integration not found' } });
      res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.post('/:integrationId/test', requireManage, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.testIntegration(req.principal.tenantId, req.params.integrationId, req.principal.userId);
      res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.get('/:integrationId/repositories', requireManage, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.listRepositories(req.principal.tenantId, req.params.integrationId);
      res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.post('/:integrationId/repositories/:repositoryId/scan', requireScan, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.triggerRepositoryScan(req.principal.tenantId, {
        integrationId: req.params.integrationId,
        repositoryId: req.params.repositoryId,
        projectId: req.body?.projectId,
        branch: req.body?.branch,
        manifestPath: req.body?.manifestPath
      }, req.principal.userId);
      res.status(202).json({ success: true, data, message: 'Repository scan queued' });
    } catch (err) { next(err); }
  });

  router.patch('/:integrationId', requireManage, IntegrationValidator.validateUpdateIntegration, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.updateIntegration(req.principal.tenantId, req.params.integrationId, req.body || {}, req.principal.userId);
      res.status(200).json({ success: true, data });
    } catch (err) { next(err); }
  });

  router.delete('/:integrationId', requireManage, async (req, res, next) => {
    try {
      const data = await scmIntegrationService.deactivateIntegration(req.principal.tenantId, req.params.integrationId, req.principal.userId);
      res.status(200).json({ success: true, data, message: 'Integration disabled' });
    } catch (err) { next(err); }
  });

  return router;
}

module.exports = createIntegrationRoutes;
