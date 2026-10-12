'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { RolePermissionPolicy, ROLE_PERMISSIONS } = require('../../src/domain/policies/role-permission-policy');
const { AuthenticatedPrincipal } = require('../../src/domain/entities/principal.entity');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const TenantManagementService = require('../../src/application/services/tenant-management.service');
const MemoryUserRepository = require('../../src/infrastructure/repositories/memory-user.repository');
const createApp = require('../../src/app');

describe('Final Backlog Remediation Suite (104 / 104 Closure)', () => {

  // ─── Track A: Security & Defense-in-Depth ───────────────────────────────
  describe('Track A: Security & Defense-in-Depth', () => {

    it('SEC-005: TenantManagementService rejects weak passwords in account provisioning', async () => {
      const tenants = new Map();
      const tenantRepo = {
        save: async (t) => { tenants.set(t.tenantKey, t); return t; },
        findByKey: async (k) => tenants.get(k) || null
      };
      const userRepo = new MemoryUserRepository();
      const service = new TenantManagementService({
        tenantRepository: tenantRepo,
        userRepository: userRepo
      });

      // 1. Weak password on createTenant
      await assert.rejects(
        () => service.createTenant({
          tenantKey: 'weak-tenant',
          name: 'Weak Tenant',
          superAdminEmail: 'super@weak.test',
          superAdminPassword: 'weak' // < 8 chars
        }),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('Password does not meet complexity requirements'));
          return true;
        }
      );

      // Provision valid tenant for user tests
      await service.createTenant({
        tenantKey: 'sec005-tenant',
        name: 'Sec005 Tenant',
        superAdminEmail: 'admin@sec005.test',
        superAdminPassword: 'Password123!'
      });

      // 2. Weak password on createTenantSuperAdmin
      await assert.rejects(
        () => service.createTenantSuperAdmin('sec005-tenant', {
          email: 'admin2@sec005.test',
          password: 'simple'
        }, 'usr_actor'),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('Password does not meet complexity requirements'));
          return true;
        }
      );

      // 3. Weak password on createEndUser
      await assert.rejects(
        () => service.createEndUser('sec005-tenant', {
          email: 'user@sec005.test',
          name: 'User',
          password: 'no_numbers_or_caps!'
        }, 'usr_actor'),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('Password does not meet complexity requirements'));
          return true;
        }
      );

      // 4. Weak password on createPlatformAdmin
      await assert.rejects(
        () => service.createPlatformAdmin({
          email: 'newplatform@admin.test',
          password: 'weak'
        }, 'usr_actor'),
        (err) => {
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('Password does not meet complexity requirements'));
          return true;
        }
      );
    });

    it('SEC-017: updateAsset enforces allowlist and discards unallowed fields', async () => {
      const service = new TenantManagementService({});
      service.inMemoryAssets.set('asset_100', {
        id: 'asset_100',
        tenantId: 'tenant_sec017',
        name: 'Initial Name',
        criticality: 'LOW',
        environment: 'DEVELOPMENT'
      });

      const updated = await service.updateAsset('tenant_sec017', 'asset_100', {
        name: 'Updated Name',
        criticality: 'HIGH',
        tenantId: 'malicious_tenant_override',
        id: 'malicious_id_override',
        unauthorizedField: 'should_be_ignored'
      }, 'usr_actor');

      assert.equal(updated.name, 'Updated Name');
      assert.equal(updated.criticality, 'HIGH');
      assert.equal(updated.tenantId, 'tenant_sec017');
      assert.equal(updated.id, 'asset_100');
      assert.equal(updated.unauthorizedField, undefined);
    });

    it('SEC-014: Helmet sets Content-Security-Policy header on HTTP responses', async () => {
      const { app } = createApp();
      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://localhost:${port}/health`);
        assert.equal(res.status, 200);
        const csp = res.headers.get('content-security-policy');
        assert.ok(csp, 'Content-Security-Policy header must be present');
        assert.ok(csp.includes("default-src 'self'"));
      } finally {
        server.close();
      }
    });
  });

  // ─── Track B: RBAC & Permission Refinement ──────────────────────────────
  describe('Track B: RBAC & Permission Refinement', () => {

    it('RBAC-010: PLATFORM_ADMIN has namespaced platform:* and does not grant arbitrary tenant permissions', () => {
      const platformPerms = ROLE_PERMISSIONS.PLATFORM_ADMIN;
      assert.ok(!platformPerms.includes('*'), 'PLATFORM_ADMIN must not include unbounded * wildcard');
      assert.ok(platformPerms.includes('platform:*'), 'PLATFORM_ADMIN must include platform:*');

      // platform:* grants platform-scoped permissions
      assert.equal(RolePermissionPolicy.hasPermission(platformPerms, 'platform:custom_action'), true);
      assert.equal(RolePermissionPolicy.hasPermission(platformPerms, 'platform:tenants:write'), true);

      // platform:* does NOT implicitly grant unassigned tenant permissions
      assert.equal(RolePermissionPolicy.hasPermission(platformPerms, 'tenant:secret_management'), false);
      assert.equal(RolePermissionPolicy.hasPermission(platformPerms, 'tenant:billing:export'), false);

      // Principal entity aligns with platform:*
      const platformPrincipal = new AuthenticatedPrincipal({
        userId: 'u_plat',
        roles: ['PLATFORM_ADMIN'],
        permissions: ['platform:*'],
        scope: 'platform'
      });
      assert.equal(platformPrincipal.hasPermission('platform:any_action'), true);
      assert.equal(platformPrincipal.hasPermission('tenant:billing'), false);
    });

    it('RBAC-010: Non-platform roles carry no wildcards', () => {
      const nonPlatformRoles = ['TENANT_SUPER_ADMIN', 'TENANT_ADMIN', 'SECURITY_MANAGER', 'SECURITY_ADMIN', 'END_USER', 'VIEWER'];
      for (const role of nonPlatformRoles) {
        const perms = ROLE_PERMISSIONS[role] || [];
        assert.ok(!perms.includes('*'), `${role} must not carry wildcard *`);
        assert.ok(!perms.includes('platform:*'), `${role} must not carry platform:*`);
      }
    });

    it('BE-10: TENANT_ADMIN has integrations:manage permission', () => {
      const tenantAdminPerms = ROLE_PERMISSIONS.TENANT_ADMIN;
      assert.ok(tenantAdminPerms.includes('integrations:manage'), 'TENANT_ADMIN must include integrations:manage');
    });

    it('RBAC-007: Granular status permissions verified in policy map', () => {
      assert.ok(ROLE_PERMISSIONS.TENANT_SUPER_ADMIN.includes('findings:resolve'));
      assert.ok(ROLE_PERMISSIONS.TENANT_SUPER_ADMIN.includes('findings:close'));
      assert.ok(ROLE_PERMISSIONS.TENANT_SUPER_ADMIN.includes('findings:reopen'));

      assert.ok(ROLE_PERMISSIONS.END_USER.includes('findings:resolve'));
      assert.ok(ROLE_PERMISSIONS.END_USER.includes('findings:close'));
      assert.ok(!ROLE_PERMISSIONS.END_USER.includes('findings:reopen'), 'END_USER cannot reopen findings');
    });

    it('BE-10: GET /api/v1/integrations and GET /:id reject caller without integrations:manage (403)', async () => {
      const express = require('express');
      const createIntegrationRoutes = require('../../src/api/routes/integration.routes');
      const createAuthorizeMiddleware = require('../../src/middleware/authorize.middleware');

      const app = express();
      app.use((req, res, next) => {
        req.principal = new AuthenticatedPrincipal({
          userId: 'usr_end',
          tenantId: 'tenant_test',
          roles: ['END_USER'],
          permissions: ROLE_PERMISSIONS.END_USER,
          scope: 'tenant'
        });
        next();
      });

      const authorizeMiddleware = createAuthorizeMiddleware(null);
      const routes = createIntegrationRoutes({
        scmIntegrationService: { listIntegrations: async () => [], getIntegration: async () => null },
        authenticateMiddleware: (req, res, next) => next(),
        authorizeMiddleware
      });
      app.use('/api/v1/integrations', routes);

      const server = app.listen(0);
      const port = server.address().port;
      try {
        const listRes = await fetch(`http://localhost:${port}/api/v1/integrations`);
        assert.equal(listRes.status, 403);
        const listBody = await listRes.json();
        assert.equal(listBody.error.code, 'FORBIDDEN');

        const getRes = await fetch(`http://localhost:${port}/api/v1/integrations/int_123`);
        assert.equal(getRes.status, 403);
        const getBody = await getRes.json();
        assert.equal(getBody.error.code, 'FORBIDDEN');
      } finally {
        server.close();
      }
    });

    it('RBAC-007: updateFindingStatus rejects unauthorized status transitions (403)', async () => {
      const VulnerabilityScannerController = require('../../src/api/controllers/vulnerability-scanner.controller');
      const controller = new VulnerabilityScannerController({
        scannerService: { updateFindingStatus: async () => ({}) }
      });

      let statusCalled = null;
      let jsonBody = null;
      const res = {
        status(s) { statusCalled = s; return this; },
        json(b) { jsonBody = b; return this; }
      };

      // 1. Caller without findings:resolve attempting RESOLVED
      const reqResolve = {
        params: { findingId: 'find_1' },
        body: { status: 'RESOLVED' },
        principal: new AuthenticatedPrincipal({
          userId: 'u1',
          tenantId: 't1',
          roles: ['VIEWER'],
          permissions: ['findings:read'],
          scope: 'tenant'
        })
      };

      await controller.updateFindingStatus(reqResolve, res, () => {});
      assert.equal(statusCalled, 403);
      assert.equal(jsonBody.error.code, 'FORBIDDEN');

      // 2. Caller without findings:reopen attempting REOPENED
      const reqReopen = {
        params: { findingId: 'find_1' },
        body: { status: 'REOPENED' },
        principal: new AuthenticatedPrincipal({
          userId: 'u1',
          tenantId: 't1',
          roles: ['END_USER'],
          permissions: ROLE_PERMISSIONS.END_USER,
          scope: 'tenant'
        })
      };

      await controller.updateFindingStatus(reqReopen, res, () => {});
      assert.equal(statusCalled, 403);
      assert.equal(jsonBody.error.code, 'FORBIDDEN');
    });
  });
});
