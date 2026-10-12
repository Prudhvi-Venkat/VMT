'use strict';

class DashboardController {
  constructor(dashboardService) {
    this.dashboardService = dashboardService;
  }

  async getPlatformDashboard(req, res, next) {
    try {
      const data = await this.dashboardService.getPlatformDashboard();
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  async getTenantDashboard(req, res, next) {
    try {
      const tenantId = req.principal?.tenantId || (req.principal?.scope === 'platform' ? (req.query?.tenantId || 'platform') : null);
      if (!tenantId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Tenant context required for tenant dashboard',
            requestId: req.id
          }
        });
      }

      const range = req.query.range || req.query.timeRange || '30d';
      const data = await this.dashboardService.getTenantDashboard(tenantId, { range });

      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  async getProjectDashboard(req, res, next) {
    try {
      const tenantId = req.principal?.tenantId;
      const { projectId } = req.params;

      if (!tenantId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Tenant context required',
            requestId: req.id
          }
        });
      }

      if (!projectId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'Project ID is required',
            requestId: req.id
          }
        });
      }

      const data = await this.dashboardService.getProjectDashboard(tenantId, projectId, req.principal);
      if (!data) {
        return res.status(404).json({
          error: {
            code: 'PROJECT_NOT_FOUND',
            message: `Project ${projectId} not found`,
            requestId: req.id
          }
        });
      }

      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }

  async getMeDashboard(req, res, next) {
    try {
      const tenantId = req.principal?.tenantId || (req.principal?.scope === 'platform' ? 'platform' : null);
      const userId = req.principal?.userId;

      if (!tenantId || !userId) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Valid user context required',
            requestId: req.id
          }
        });
      }

      const data = await this.dashboardService.getMeDashboard(tenantId, userId);
      return res.status(200).json({
        success: true,
        data
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = DashboardController;
