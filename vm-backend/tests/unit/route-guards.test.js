'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const { createGuardHelpers } = require('../../src/api/routes/route-guards');
const createAuthorizeMiddleware = require('../../src/middleware/authorize.middleware');
const DashboardService = require('../../src/application/services/dashboard.service');

describe('BE-01 & BE-02: Route Guards Fail-Closed & Project Authorization', () => {
  it('BE-01: createGuardHelpers fails closed (500) when authorizeMiddleware is missing', async () => {
    const guards = createGuardHelpers(null);
    const middleware = guards.requirePermission('scans:read');

    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(s) {
        responseStatus = s;
        return {
          json(b) {
            responseBody = b;
          }
        };
      }
    };

    middleware({ id: 'req_1' }, res, () => {});
    assert.strictEqual(responseStatus, 500);
    assert.strictEqual(responseBody.error.code, 'AUTHORIZATION_CONFIG_ERROR');
  });

  it('BE-01: authorize.middleware fails closed (500) when permission or role is falsy', () => {
    const authorizeMiddleware = createAuthorizeMiddleware();

    let responseStatus = null;
    let responseBody = null;
    const res = {
      status(s) {
        responseStatus = s;
        return {
          json(b) {
            responseBody = b;
          }
        };
      }
    };

    const emptyPermHandler = authorizeMiddleware.requirePermission('');
    emptyPermHandler({ id: 'req_2' }, res, () => {});
    assert.strictEqual(responseStatus, 500);
    assert.strictEqual(responseBody.error.code, 'AUTHORIZATION_CONFIG_ERROR');

    const emptyRoleHandler = authorizeMiddleware.requireRole(null);
    emptyRoleHandler({ id: 'req_3' }, res, () => {});
    assert.strictEqual(responseStatus, 500);
    assert.strictEqual(responseBody.error.code, 'AUTHORIZATION_CONFIG_ERROR');
  });

  it('BE-02: getProjectDashboard rejects non-member tenant user with 403 Forbidden', async () => {
    const mockProjectRepo = {
      async findById(tenantId, projectId) {
        return {
          id: projectId,
          name: 'Secret Project',
          ownerUserId: 'usr_owner',
          members: [{ userId: 'usr_member', role: 'CONTRIBUTOR' }]
        };
      }
    };

    const dashboardService = new DashboardService({
      projectRepository: mockProjectRepo,
      scanFindingRepository: { async findByTenant() { return { items: [] }; } }
    });

    const nonMemberPrincipal = {
      userId: 'usr_intruder',
      roles: ['END_USER']
    };

    await assert.rejects(
      async () => {
        await dashboardService.getProjectDashboard('tenant_test', 'proj_secret', nonMemberPrincipal);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 403);
        assert.strictEqual(err.code, 'FORBIDDEN');
        return true;
      }
    );

    // Member should be allowed
    const memberPrincipal = {
      userId: 'usr_member',
      roles: ['END_USER']
    };
    const memberData = await dashboardService.getProjectDashboard('tenant_test', 'proj_secret', memberPrincipal);
    assert.ok(memberData);

    // Tenant admin should be allowed even if not an explicit member
    const adminPrincipal = {
      userId: 'usr_admin',
      roles: ['TENANT_ADMIN']
    };
    const adminData = await dashboardService.getProjectDashboard('tenant_test', 'proj_secret', adminPrincipal);
    assert.ok(adminData);
  });
});
