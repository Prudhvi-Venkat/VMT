'use strict';

const express = require('express');
const { createGuardHelpers } = require('./route-guards');
const DashboardValidator = require('../validators/dashboard.validator');

function createDashboardRoutes({
  dashboardController,
  authenticateMiddleware,
  authorizeMiddleware
}) {
  const router = express.Router();
  const { requireRole, requirePermission } = createGuardHelpers(authorizeMiddleware);

  router.use(authenticateMiddleware);

  // Platform Admin aggregate dashboard
  router.get('/platform/dashboard', 
    requireRole('PLATFORM_ADMIN'),
    DashboardValidator.validateDashboardQuery,
    (req, res, next) => dashboardController.getPlatformDashboard(req, res, next)
  );

  // Tenant Super Admin aggregate dashboard
  router.get('/tenant/dashboard',
    DashboardValidator.validateDashboardQuery,
    (req, res, next) => {
      if (
        !req.principal?.roles?.includes('TENANT_SUPER_ADMIN') &&
        !req.principal?.roles?.includes('TENANT_ADMIN') &&
        !req.principal?.roles?.includes('PLATFORM_ADMIN')
      ) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Tenant administrator permission required', requestId: req.id } });
      }
      dashboardController.getTenantDashboard(req, res, next);
    }
  );

  // Project exposure dashboard
  router.get('/projects/:projectId/dashboard', 
    requirePermission('tenant:projects:read'),
    DashboardValidator.validateDashboardQuery,
    (req, res, next) => {
      dashboardController.getProjectDashboard(req, res, next);
    }
  );

  // End User personal dashboard
  router.get('/me/dashboard',
    DashboardValidator.validateDashboardQuery,
    (req, res, next) => {
      dashboardController.getMeDashboard(req, res, next);
    }
  );

  return router;
}

module.exports = createDashboardRoutes;
