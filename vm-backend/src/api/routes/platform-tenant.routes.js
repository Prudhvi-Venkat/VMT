'use strict';

const express = require('express');
const TenantValidator = require('../validators/tenant.validator');
const { parsePaginationParams } = require('../helpers/pagination.helper');

function createPlatformTenantRoutes({ tenantManagementService, authenticateMiddleware, authorizeMiddleware }) {
  const router = express.Router();

  // All platform admin endpoints require authentication, platform scope, and platform:admin permission
  router.use(authenticateMiddleware);
  router.use(authorizeMiddleware.requirePlatformScope());
  router.use(authorizeMiddleware.requirePermission('platform:admin'));

  // 1. Create Tenant & Provision Database & Super Admin
  router.post('/tenants', TenantValidator.validateCreateTenant, async (req, res, next) => {
    try {
      const { tenantKey, name, displayName, superAdminEmail, superAdminPassword, superAdminName } = req.body;
      const createdBy = req.principal?.userId || 'usr_platform_admin';

      const result = await tenantManagementService.createTenant({
        tenantKey,
        name,
        displayName,
        superAdminEmail,
        superAdminPassword,
        superAdminName,
        createdBy
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Tenant "${result.tenant.name}" created and database provisioned successfully`
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. List all Tenants
  router.get('/tenants', async (req, res, next) => {
    try {
      const { status } = req.query;
      const { limit, offset } = parsePaginationParams(req.query, { defaultPageSize: 50, maxPageSize: 100 });
      const result = await tenantManagementService.listTenants({
        status,
        limit,
        offset
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

  // 3. Get Tenant Details
  router.get('/tenants/:tenantKey', async (req, res, next) => {
    try {
      const tenant = await tenantManagementService.getTenant(req.params.tenantKey);
      if (!tenant) {
        return res.status(404).json({
          error: { code: 'TENANT_NOT_FOUND', message: `Tenant "${req.params.tenantKey}" not found`, requestId: req.id }
        });
      }
      res.status(200).json({ success: true, data: tenant });
    } catch (err) {
      next(err);
    }
  });

  // 3b. Update Tenant Information (Modify Tenant Details)
  router.patch('/tenants/:tenantKey', async (req, res, next) => {
    try {
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.updateTenant(req.params.tenantKey, req.body, actorUserId);
      res.status(200).json({
        success: true,
        data: updated,
        message: `Tenant "${req.params.tenantKey}" updated successfully`
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Update Tenant Status (Suspend / Activate / Disable)
  router.patch('/tenants/:tenantKey/status', async (req, res, next) => {
    try {
      const { status, reason } = req.body;
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.updateTenantStatus(req.params.tenantKey, status, reason, actorUserId);
      res.status(200).json({
        success: true,
        data: updated,
        message: `Tenant "${req.params.tenantKey}" status updated to ${status}`
      });
    } catch (err) {
      next(err);
    }
  });

  // Dedicated lifecycle actions
  router.post('/tenants/:tenantKey/activate', async (req, res, next) => {
    try {
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.activateTenant(req.params.tenantKey, actorUserId);
      res.status(200).json({ success: true, data: updated, message: `Tenant "${req.params.tenantKey}" activated` });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:tenantKey/suspend', async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.suspendTenant(req.params.tenantKey, reason, actorUserId);
      res.status(200).json({ success: true, data: updated, message: `Tenant "${req.params.tenantKey}" suspended` });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:tenantKey/disable', async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.disableTenant(req.params.tenantKey, reason, actorUserId);
      res.status(200).json({ success: true, data: updated, message: `Tenant "${req.params.tenantKey}" disabled` });
    } catch (err) {
      next(err);
    }
  });

  router.post('/tenants/:tenantKey/decommission', async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.decommissionTenant(req.params.tenantKey, reason, actorUserId);
      res.status(200).json({ success: true, data: updated, message: `Tenant "${req.params.tenantKey}" decommissioned` });
    } catch (err) {
      next(err);
    }
  });

  // 5. Create additional Tenant Super Admin
  router.post('/tenants/:tenantKey/super-admins', async (req, res, next) => {
    try {
      const { email, password, name } = req.body;
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const admin = await tenantManagementService.createTenantSuperAdmin(
        req.params.tenantKey,
        { email, password, name },
        actorUserId
      );
      res.status(201).json({
        success: true,
        data: {
          id: admin.id,
          email: admin.email,
          roles: admin.roles,
          tenantId: admin.tenantId
        },
        message: `Super Admin created for tenant "${req.params.tenantKey}"`
      });
    } catch (err) {
      next(err);
    }
  });

  // 5b. List Super Admins for a Tenant
  router.get('/tenants/:tenantKey/super-admins', async (req, res, next) => {
    try {
      const admins = await tenantManagementService.listTenantSuperAdmins(req.params.tenantKey);
      res.status(200).json({ success: true, data: admins });
    } catch (err) {
      next(err);
    }
  });

  // 5c. Update Tenant Super Admin Profile
  router.patch('/tenants/:tenantKey/super-admins/:userId', async (req, res, next) => {
    try {
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const updated = await tenantManagementService.updateTenantSuperAdmin(
        req.params.tenantKey,
        req.params.userId,
        req.body,
        actorUserId
      );
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Tenant Super Admin updated successfully'
      });
    } catch (err) {
      next(err);
    }
  });

  // 5d. Reset Tenant Super Admin Password
  router.post('/tenants/:tenantKey/super-admins/:userId/reset-password', async (req, res, next) => {
    try {
      const { newPassword } = req.body;
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const result = await tenantManagementService.resetTenantSuperAdminPassword(
        req.params.tenantKey,
        req.params.userId,
        newPassword,
        actorUserId
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 6. Platform Admin Management (Only Platform Admin can register another Platform Admin)
  router.post('/platform-admins', async (req, res, next) => {
    try {
      const { name, email, password, roles } = req.body;
      const actorUserId = req.principal?.userId || 'usr_platform_admin';
      const admin = await tenantManagementService.registerPlatformAdmin(
        { name, email, password, roles },
        actorUserId
      );
      res.status(201).json({
        success: true,
        data: admin,
        message: 'Platform administrator registered successfully'
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/platform-admins', async (req, res, next) => {
    try {
      const admins = await tenantManagementService.listPlatformAdmins();
      res.status(200).json({ success: true, data: admins });
    } catch (err) {
      next(err);
    }
  });

  // 7. Platform Audit Logs (Real-time live synced from platform_audit_logs)
  router.get('/audit', async (req, res, next) => {
    try {
      const platformDb = tenantManagementService.tenantDbManager.getPlatformDb();
      const logs = await platformDb.collection('platform_audit_logs')
        .find()
        .sort({ timestamp: -1 })
        .limit(100)
        .toArray();
      res.status(200).json({ success: true, data: logs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = createPlatformTenantRoutes;
