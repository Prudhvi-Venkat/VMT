'use strict';

const express = require('express');
const TenantValidator = require('../validators/tenant.validator');
const AssetValidator = require('../validators/asset.validator');

function createTenantAdminRoutes({ tenantManagementService, authenticateMiddleware, authorizeMiddleware }) {
  const router = express.Router();

  // All tenant endpoints require authentication
  router.use(authenticateMiddleware);

  // Helper middleware to ensure tenant context
  function requireTenantContext(req, res, next) {
    const tenantId = req.principal?.tenantId;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        error: { code: 'TENANT_CONTEXT_REQUIRED', message: 'User is not bound to a tenant' }
      });
    }
    next();
  }

  router.use(requireTenantContext);

  // 1. List Users in Tenant (Super Admin or Users with tenant:users:read)
  router.get('/users', authorizeMiddleware.requirePermission('tenant:users:read'), async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const users = await tenantManagementService.listTenantUsers(tenantKey);
      res.status(200).json({ success: true, data: users });
    } catch (err) {
      next(err);
    }
  });

  // 2. Create End User in Tenant (Super Admin / Admin with tenant:users:write)
  router.post('/users', authorizeMiddleware.requirePermission('tenant:users:write'), TenantValidator.validateCreateUser, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const { email, password, name, firstName, lastName, title, employeeId, department, roles, assignedProjectIds } = req.body;
      const actorUserId = req.principal.userId;

      const user = await tenantManagementService.createEndUser(tenantKey, {
        email,
        password,
        name,
        firstName,
        lastName,
        title,
        employeeId,
        department,
        roles: roles || ['END_USER'],
        assignedProjectIds
      }, actorUserId);

      res.status(201).json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          roles: user.roles,
          status: user.status
        },
        message: `User "${user.email}" created successfully`
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Update User Status
  router.patch(
    '/users/:userId/status',
    authorizeMiddleware.requirePermission('tenant:users:write'),
    TenantValidator.validateUpdateUserStatus,
    authorizeMiddleware.evaluatePolicy('tenant:users:write', (req) => ({
      type: 'user',
      id: req.params.userId,
      tenantId: req.principal?.tenantId
    })),
    async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const { status } = req.body;
      const actorUserId = req.principal.userId;
      await tenantManagementService.updateTenantUserStatus(tenantKey, req.params.userId, status, actorUserId);

      res.status(200).json({
        success: true,
        message: `User status updated to ${status}`
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. List Projects (Super Admin sees all, End User sees assigned)
  router.get('/projects', authorizeMiddleware.requirePermission('tenant:projects:read'), async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const projects = await tenantManagementService.listProjects(tenantKey, req.principal);
      res.status(200).json({ success: true, data: projects });
    } catch (err) {
      next(err);
    }
  });

  // 5. Create Project (Super Admin / Admin with tenant:projects:write)
  router.post('/projects', authorizeMiddleware.requirePermission('tenant:projects:write'), TenantValidator.validateCreateProject, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const {
        name,
        key,
        description,
        department,
        businessUnit,
        applicationName,
        startDate,
        endDate,
        stage,
        cloudProvider,
        cloudMetadata,
        assignedUserIds,
        initialRole,
        ownerUserId
      } = req.body;
      const actorUserId = req.principal.userId;

      const project = await tenantManagementService.createProject(tenantKey, {
        name,
        key,
        description,
        department,
        businessUnit,
        applicationName,
        startDate,
        endDate,
        stage,
        cloudProvider,
        cloudMetadata,
        assignedUserIds,
        initialRole,
        ownerUserId
      }, actorUserId);

      res.status(201).json({
        success: true,
        data: project,
        message: `Project "${project.name}" created successfully`
      });
    } catch (err) {
      next(err);
    }
  });

  // 5b. Update Project Status (Activate / Deactivate)
  router.patch('/projects/:projectId/status', authorizeMiddleware.requirePermission('tenant:projects:write'), TenantValidator.validateUpdateProjectStatus, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const { status } = req.body;
      const actorUserId = req.principal.userId;

      const result = await tenantManagementService.updateProjectStatus(
        tenantKey,
        req.params.projectId,
        status,
        actorUserId
      );

      res.status(200).json({
        success: true,
        data: result,
        message: `Project status updated to ${result.status}`
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. Assign Member to Project
  router.post('/projects/:projectId/members', authorizeMiddleware.requirePermission('tenant:projects:write'), TenantValidator.validateAssignProjectMember, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const { userId, permissions, role } = req.body;
      const actorUserId = req.principal.userId;

      const member = await tenantManagementService.assignProjectMember(
        tenantKey,
        req.params.projectId,
        { userId, permissions, role },
        actorUserId
      );

      res.status(200).json({
        success: true,
        data: member,
        message: 'Project membership configured'
      });
    } catch (err) {
      next(err);
    }
  });

  // 7. Get Tenant Audit Logs (requires audit:read)
  router.get('/audit', authorizeMiddleware.requirePermission('audit:read'), async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const { userId, action, projectId, limit, offset, page } = req.query;
      const limitVal = Math.min(200, Math.max(1, limit ? parseInt(limit, 10) : 100));
      let offsetVal = 0;
      if (offset !== undefined) {
        offsetVal = Math.max(0, parseInt(offset, 10) || 0);
      } else if (page !== undefined) {
        const pageVal = Math.max(1, parseInt(page, 10) || 1);
        offsetVal = (pageVal - 1) * limitVal;
      }

      const result = await tenantManagementService.getTenantAuditLogs(tenantKey, {
        userId,
        action,
        projectId,
        limit: limitVal,
        offset: offsetVal
      });

      res.status(200).json({
        success: true,
        data: result.items,
        meta: { total: result.total }
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. Asset Management Endpoints
  router.get('/assets', authorizeMiddleware.requirePermission('assets:read'), async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const assets = await tenantManagementService.listAssets(tenantKey, req.query);
      res.status(200).json({ success: true, data: assets });
    } catch (err) {
      next(err);
    }
  });

  router.post('/assets', authorizeMiddleware.requirePermission('assets:create'), AssetValidator.validateCreateAsset, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const actorUserId = req.principal.userId;
      const asset = await tenantManagementService.createAsset(tenantKey, req.body, actorUserId);
      res.status(201).json({
        success: true,
        data: asset,
        message: `Asset "${asset.name}" onboarded successfully`
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/assets/:assetId', authorizeMiddleware.requirePermission('assets:update'), AssetValidator.validateUpdateAsset, async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const actorUserId = req.principal.userId;
      const updated = await tenantManagementService.updateAsset(tenantKey, req.params.assetId, req.body, actorUserId);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Asset updated successfully'
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/assets/:assetId', authorizeMiddleware.requirePermission('assets:delete'), async (req, res, next) => {
    try {
      const tenantKey = req.principal.tenantId;
      const actorUserId = req.principal.userId;
      const result = await tenantManagementService.deleteAsset(tenantKey, req.params.assetId, actorUserId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createTenantAdminRoutes;
