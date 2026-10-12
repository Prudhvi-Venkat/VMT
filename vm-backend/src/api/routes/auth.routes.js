'use strict';

const express = require('express');
const config = require('../../config');
const AuthValidator = require('../validators/auth.validator');
const createRateLimiter = require('../../middleware/rate-limiter.middleware');

function createAuthRoutes({ authController, authenticateMiddleware, authorizeMiddleware, getTenantManagementService }) {
  const router = express.Router();

  const loginRateLimiter = createRateLimiter({
    windowMs: config.security.loginRateLimitWindowMs,
    maxRequests: config.security.loginRateLimitMax,
    message: 'Too many login attempts, please try again later'
  });

  const refreshRateLimiter = createRateLimiter({
    windowMs: config.security.refreshRateLimitWindowMs,
    maxRequests: config.security.refreshRateLimitMax,
    message: 'Too many token refresh attempts, please try again later'
  });

  // Public Super Admin & Tenant Registration
  router.post('/register-tenant-super-admin', loginRateLimiter, AuthValidator.validateTenantRegistration, async (req, res, next) => {
    try {
      const {
        tenantKey,
        name,
        displayName,
        superAdminEmail,
        superAdminPassword,
        superAdminName
      } = req.body;

      const svc = typeof getTenantManagementService === 'function' ? getTenantManagementService() : null;
      if (!svc) {
        return res.status(503).json({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Tenant provisioning service unavailable', requestId: req.id }
        });
      }

      const result = await svc.createTenant({
        tenantKey,
        name,
        displayName: displayName || name,
        superAdminEmail,
        superAdminPassword,
        superAdminName: superAdminName || 'Tenant Super Admin',
        createdBy: 'public_registration'
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Organization "${result.tenant.name}" created and Super Admin registered successfully.`
      });
    } catch (err) {
      next(err);
    }
  });

  // Public Endpoints (Rate Limited)
  router.post('/login', loginRateLimiter, AuthValidator.validateLogin, (req, res, next) => {
    authController.login(req, res, next);
  });

  router.post('/refresh', refreshRateLimiter, AuthValidator.validateRefresh, (req, res, next) => {
    authController.refresh(req, res, next);
  });

  // Protected Endpoints (Authentication Required)
  router.post('/logout', authenticateMiddleware, (req, res, next) => {
    authController.logout(req, res, next);
  });

  router.post('/logout-all', authenticateMiddleware, (req, res, next) => {
    authController.logoutAll(req, res, next);
  });

  // User Preferences (Authentication Required)
  router.get('/preferences', authenticateMiddleware, authorizeMiddleware.requireAuthenticated(), (req, res, next) => {
    authController.getPreferences(req, res, next);
  });

  router.put('/preferences', authenticateMiddleware, authorizeMiddleware.requireAuthenticated(), (req, res, next) => {
    authController.updatePreferences(req, res, next);
  });

  // Password Management
  router.post('/change-password', loginRateLimiter, authenticateMiddleware, (req, res, next) => {
    authController.changePassword(req, res, next);
  });

  router.post('/forgot-password', loginRateLimiter, (req, res, next) => {
    authController.forgotPassword(req, res, next);
  });

  router.post('/reset-password', loginRateLimiter, (req, res, next) => {
    authController.resetPassword(req, res, next);
  });

  // Protected Test Endpoint: Platform Admin / Authenticated Profile
  router.get('/me', authenticateMiddleware, authorizeMiddleware.requireAuthenticated(), (req, res, next) => {
    authController.getMe(req, res, next);
  });

  // Protected Platform Admin Verification Endpoint
  router.get('/admin/verify', authenticateMiddleware, authorizeMiddleware.requirePermission('platform:admin'), (req, res) => {
    res.status(200).json({
      status: 'AUTHORIZED',
      message: 'Platform admin access granted',
      principal: {
        userId: req.principal.userId,
        scope: req.principal.scope,
        roles: req.principal.roles
      }
    });
  });

  return router;
}

module.exports = createAuthRoutes;
