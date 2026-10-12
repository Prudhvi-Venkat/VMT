'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createAssetRoutes = require('../../src/api/routes/asset.routes');
const createTenantAdminRoutes = require('../../src/api/routes/tenant-admin.routes');
const createAuthorizeMiddleware = require('../../src/middleware/authorize.middleware');
const { policyEngine } = require('../../src/domain/policies/authorization-policy-engine');

describe('P1: Route-Level Policy Engine Enforcement & ABAC Safeguards', () => {
  const authorizeMiddleware = createAuthorizeMiddleware(null, policyEngine);

  describe('Asset Routes: Criticality Guard & Immutability', () => {
    it('blocks standard security engineer from deleting a TIER_1_CRITICAL asset with 403 ELEVATED_ROLE_REQUIRED', async () => {
      // Mock asset service returning a Tier-1 critical asset
      const mockAssetService = {
        getAssetById: async (tenantId, assetId) => ({
          id: assetId,
          criticality: 'TIER_1_CRITICAL',
          status: 'ACTIVE'
        }),
        deleteAsset: async () => ({})
      };

      const assetRoutes = createAssetRoutes({
        assetController: { assetService: mockAssetService },
        authenticateMiddleware: (req, res, next) => {
          req.principal = {
            userId: 'eng-1',
            scope: 'tenant',
            tenantId: 'tenant-omega',
            roles: ['SECURITY_ENGINEER'],
            permissions: ['assets:delete', 'assets:read']
          };
          req.tenantId = 'tenant-omega';
          next();
        },
        authorizeMiddleware
      });

      const app = express();
      app.use(express.json());
      app.use('/assets', assetRoutes);

      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/assets/asset-tier1-crit`, {
          method: 'DELETE'
        });

        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'FORBIDDEN');
        assert.strictEqual(data.error.reason, 'ELEVATED_ROLE_REQUIRED');
      } finally {
        server.close();
      }
    });

    it('blocks updating an ARCHIVED asset with 403 RESOURCE_IMMUTABLE', async () => {
      const mockAssetService = {
        getAssetById: async (tenantId, assetId) => ({
          id: assetId,
          criticality: 'TIER_2_HIGH',
          status: 'ARCHIVED'
        }),
        updateAsset: async () => ({})
      };

      const assetRoutes = createAssetRoutes({
        assetController: { assetService: mockAssetService },
        authenticateMiddleware: (req, res, next) => {
          req.principal = {
            userId: 'admin-1',
            scope: 'tenant',
            tenantId: 'tenant-omega',
            roles: ['TENANT_SUPER_ADMIN'],
            permissions: ['assets:update', 'assets:read']
          };
          req.tenantId = 'tenant-omega';
          next();
        },
        authorizeMiddleware
      });

      const app = express();
      app.use(express.json());
      app.use('/assets', assetRoutes);

      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/assets/asset-archived`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed Asset' })
        });

        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'FORBIDDEN');
        assert.strictEqual(data.error.reason, 'RESOURCE_IMMUTABLE');
      } finally {
        server.close();
      }
    });
  });

  describe('Tenant Admin Routes: Self-Administration Prevention', () => {
    it('blocks super admin from deactivating their own account with 403 SELF_ADMIN_FORBIDDEN', async () => {
      const mockTenantManagementService = {
        updateTenantUserStatus: async () => ({})
      };

      const tenantAdminRoutes = createTenantAdminRoutes({
        tenantManagementService: mockTenantManagementService,
        authenticateMiddleware: (req, res, next) => {
          req.principal = {
            userId: 'super-admin-self',
            scope: 'tenant',
            tenantId: 'tenant-omega',
            roles: ['TENANT_SUPER_ADMIN'],
            permissions: ['tenant:users:write', 'tenant:users:read']
          };
          req.tenantId = 'tenant-omega';
          next();
        },
        authorizeMiddleware
      });

      const app = express();
      app.use(express.json());
      app.use('/tenant', tenantAdminRoutes);

      const server = app.listen(0);
      const port = server.address().port;

      try {
        const res = await fetch(`http://127.0.0.1:${port}/tenant/users/super-admin-self/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'DEACTIVATED' })
        });

        assert.strictEqual(res.status, 403);
        const data = await res.json();
        assert.strictEqual(data.error.code, 'FORBIDDEN');
        assert.strictEqual(data.error.reason, 'SELF_ADMIN_FORBIDDEN');
      } finally {
        server.close();
      }
    });
  });
});
