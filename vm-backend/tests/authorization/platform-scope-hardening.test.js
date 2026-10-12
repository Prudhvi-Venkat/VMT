'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createPlatformTenantRoutes = require('../../src/api/routes/platform-tenant.routes');
const createAuthorizeMiddleware = require('../../src/middleware/authorize.middleware');
const { AuthenticatedPrincipal } = require('../../src/domain/entities/principal.entity');
const TenantManagementService = require('../../src/application/services/tenant-management.service');

describe('P1: Platform Scope Authorization Hardening & Negative Route Tests', () => {
  const authorizeMiddleware = createAuthorizeMiddleware();

  // Mock tenant management service
  const mockTenantManagementService = {
    listTenants: async () => ({ items: [{ id: 't1', name: 'Tenant 1' }], total: 1 }),
    getTenant: async (key) => ({ id: 't1', tenantKey: key, name: 'Tenant 1' }),
    createTenant: async () => ({ tenant: { name: 'Test' } }),
    updateTenant: async () => ({}),
    updateTenantStatus: async () => ({}),
    activateTenant: async () => ({}),
    suspendTenant: async () => ({}),
    disableTenant: async () => ({}),
    decommissionTenant: async () => ({}),
    createTenantSuperAdmin: async () => ({ id: 'u1' }),
    listTenantSuperAdmins: async () => [],
    registerPlatformAdmin: async () => ({ id: 'p1' }),
    listPlatformAdmins: async () => [],
    tenantDbManager: {
      getPlatformDb: () => ({
        collection: () => ({
          find: () => ({
            sort: () => ({
              limit: () => ({
                toArray: async () => []
              })
            })
          })
        })
      })
    }
  };

  function setupAppWithAuth(getPrincipal) {
    const app = express();
    app.use(express.json());

    const authenticateMiddleware = (req, res, next) => {
      const principal = getPrincipal(req);
      if (principal) {
        req.principal = principal;
        req.user = principal;
      }
      next();
    };

    const routes = createPlatformTenantRoutes({
      tenantManagementService: mockTenantManagementService,
      authenticateMiddleware,
      authorizeMiddleware
    });

    app.use('/platform', routes);
    return app;
  }

  const platformRoutes = [
    { method: 'GET', path: '/platform/tenants' },
    { method: 'POST', path: '/platform/tenants', body: { tenantKey: 'test', name: 'Test Corp', superAdminEmail: 'a@b.com', superAdminPassword: 'Password#2026!' } },
    { method: 'GET', path: '/platform/tenants/test-key' },
    { method: 'PATCH', path: '/platform/tenants/test-key', body: { name: 'New Name' } },
    { method: 'PATCH', path: '/platform/tenants/test-key/status', body: { status: 'ACTIVE' } },
    { method: 'POST', path: '/platform/tenants/test-key/activate' },
    { method: 'POST', path: '/platform/tenants/test-key/suspend' },
    { method: 'POST', path: '/platform/tenants/test-key/disable' },
    { method: 'POST', path: '/platform/tenants/test-key/decommission' },
    { method: 'POST', path: '/platform/tenants/test-key/super-admins', body: { email: 'sa@test.local', password: 'Password#2026!' } },
    { method: 'GET', path: '/platform/tenants/test-key/super-admins' },
    { method: 'POST', path: '/platform/platform-admins', body: { name: 'Admin', email: 'adm@platform.local', password: 'Password#2026!' } },
    { method: 'GET', path: '/platform/platform-admins' },
    { method: 'GET', path: '/platform/audit' }
  ];

  it('rejects unauthenticated requests on all platform routes with 401', async () => {
    const app = setupAppWithAuth(() => null);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      for (const route of platformRoutes) {
        const res = await fetch(`http://127.0.0.1:${port}${route.path}`, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: route.body ? JSON.stringify(route.body) : undefined
        });
        assert.strictEqual(res.status, 401, `Route ${route.method} ${route.path} should return 401`);
      }
    } finally {
      server.close();
    }
  });

  it('rejects tenant super admins on all platform routes with 403 PLATFORM_SCOPE_REQUIRED', async () => {
    const tenantSuperAdminPrincipal = new AuthenticatedPrincipal({
      userId: 'usr-tenant-super',
      scope: 'tenant',
      tenantId: 'tenant-acme',
      roles: ['TENANT_SUPER_ADMIN'],
      permissions: ['tenant:*', 'assets:*', 'scans:*']
    });

    const app = setupAppWithAuth(() => tenantSuperAdminPrincipal);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      for (const route of platformRoutes) {
        const res = await fetch(`http://127.0.0.1:${port}${route.path}`, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: route.body ? JSON.stringify(route.body) : undefined
        });
        assert.strictEqual(res.status, 403, `Route ${route.method} ${route.path} should return 403`);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'PLATFORM_SCOPE_REQUIRED');
      }
    } finally {
      server.close();
    }
  });

  it('rejects tenant users claiming injected PLATFORM_ADMIN role when scope !== platform', async () => {
    const sneakyTenantUserPrincipal = new AuthenticatedPrincipal({
      userId: 'usr-sneaky-tenant',
      scope: 'tenant',
      tenantId: 'tenant-acme',
      roles: ['PLATFORM_ADMIN'], // Injected role!
      permissions: ['platform:admin', 'platform:*']
    });

    const app = setupAppWithAuth(() => sneakyTenantUserPrincipal);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      for (const route of platformRoutes) {
        const res = await fetch(`http://127.0.0.1:${port}${route.path}`, {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: route.body ? JSON.stringify(route.body) : undefined
        });
        assert.strictEqual(res.status, 403, `Route ${route.method} ${route.path} should return 403`);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'PLATFORM_SCOPE_REQUIRED');
      }
    } finally {
      server.close();
    }
  });

  it('rejects platform identity when platform:admin permission is missing', async () => {
    const limitedPlatformPrincipal = new AuthenticatedPrincipal({
      userId: 'usr-platform-viewer',
      scope: 'platform',
      roles: ['VIEWER'],
      permissions: ['platform:read'] // Missing platform:admin
    });

    const app = setupAppWithAuth(() => limitedPlatformPrincipal);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/platform/tenants`, {
        method: 'GET'
      });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'FORBIDDEN');
      assert.strictEqual(data.error.message, 'Access denied: insufficient permissions');
    } finally {
      server.close();
    }
  });

  it('allows verified platform administrator with scope === platform and platform:admin permission', async () => {
    const platformAdminPrincipal = new AuthenticatedPrincipal({
      userId: 'usr-platform-admin-root',
      scope: 'platform',
      roles: ['PLATFORM_ADMIN'],
      permissions: ['platform:admin', 'platform:*', '*']
    });

    const app = setupAppWithAuth(() => platformAdminPrincipal);
    const server = app.listen(0);
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/platform/tenants`, {
        method: 'GET'
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.length, 1);
    } finally {
      server.close();
    }
  });

  it('prevents tenant user provisioning with PLATFORM_ADMIN in TenantManagementService', async () => {
    const service = new TenantManagementService({
      tenantRepository: {},
      userRepository: {},
      tenantDbManager: {}
    });

    await assert.rejects(
      () => service.createEndUser('tenant-test', {
        email: 'attacker@tenant.local',
        password: 'ValidPassword#2026!',
        roles: ['PLATFORM_ADMIN']
      }, 'actor-1'),
      (err) => {
        assert.strictEqual(err.code, 'INVALID_TENANT_ROLE');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });
});
