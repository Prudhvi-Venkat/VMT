'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AuthorizationPolicyEngine,
  PolicyDecisionReason
} = require('../../src/domain/policies/authorization-policy-engine');
const createAuthorizeMiddleware = require('../../src/middleware/authorize.middleware');

describe('Centralized Authorization Policy Engine (ADR-007 / Section 5)', () => {
  const engine = new AuthorizationPolicyEngine();

  describe('1. Deny-Override & Fail-Closed Defaults', () => {
    it('rejects evaluation when subject is missing', () => {
      const decision = engine.evaluate({ action: 'findings:read' });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.MISSING_CONTEXT);
    });

    it('rejects evaluation when action is missing or invalid', () => {
      const decision = engine.evaluate({ subject: { userId: 'u1', roles: ['END_USER'] } });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.MISSING_CONTEXT);
    });

    it('rejects evaluation when subject status is DISABLED or LOCKED', () => {
      const decision = engine.evaluate({
        subject: { userId: 'u1', status: 'DISABLED', roles: ['TENANT_SUPER_ADMIN'] },
        action: 'findings:read'
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.SUBJECT_INACTIVE);
    });
  });

  describe('2. Tenant Boundary Isolation (SEC-001)', () => {
    it('denies tenant-scoped user accessing another tenant resource', () => {
      const decision = engine.evaluate({
        subject: { userId: 'u1', status: 'ACTIVE', tenantId: 'tenant-alpha', roles: ['TENANT_SUPER_ADMIN'] },
        action: 'findings:read',
        resource: { tenantId: 'tenant-beta', type: 'finding', id: 'f-101' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.CROSS_TENANT_FORBIDDEN);
    });

    it('allows platform admin to access resource across any tenant', () => {
      const decision = engine.evaluate({
        subject: { userId: 'admin-1', status: 'ACTIVE', scope: 'platform', roles: ['PLATFORM_ADMIN'] },
        action: 'findings:read',
        resource: { tenantId: 'tenant-beta', type: 'finding', id: 'f-101' }
      });
      assert.strictEqual(decision.allowed, true);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
    });
  });

  describe('3. Separation of Duties & Dual-Control (SEC-006)', () => {
    it('prevents user from deactivating or deleting themselves', () => {
      const decision = engine.evaluate({
        subject: { userId: 'usr-admin-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 't-1' },
        action: 'users:deactivate',
        resource: { type: 'user', id: 'usr-admin-1', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.SELF_ADMIN_FORBIDDEN);
    });

    it('prevents user from approving their own exemption (dual-control violation)', () => {
      const decision = engine.evaluate({
        subject: { userId: 'usr-dev-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 't-1' },
        action: 'exemptions:approve',
        resource: { type: 'exemption', id: 'ex-01', requestedBy: 'usr-dev-1', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.DUAL_CONTROL_VIOLATION);
    });

    it('allows independent authority to approve exemption (dual-control satisfied)', () => {
      const decision = engine.evaluate({
        subject: { userId: 'usr-sec-officer', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 't-1' },
        action: 'exemptions:approve',
        resource: { type: 'exemption', id: 'ex-01', requestedBy: 'usr-dev-1', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, true);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
    });
  });

  describe('4. RBAC (Role and Permission Verification)', () => {
    it('denies action when user lacks required permission', () => {
      const decision = engine.evaluate({
        subject: { userId: 'u-viewer', status: 'ACTIVE', roles: ['VIEWER'], tenantId: 't-1' },
        action: 'assets:delete',
        resource: { type: 'asset', id: 'a-1', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.INSUFFICIENT_PERMISSIONS);
    });

    it('allows action when user has explicit permission via role', () => {
      const decision = engine.evaluate({
        subject: { userId: 'u-sec', status: 'ACTIVE', roles: ['SECURITY_MANAGER'], tenantId: 't-1' },
        action: 'assets:update',
        resource: { type: 'asset', id: 'a-1', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, true);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
    });
  });

  describe('5. ABAC: Attribute Constraints', () => {
    it('denies END_USER access to resources belonging to unassigned projects', () => {
      const decision = engine.evaluate({
        subject: {
          userId: 'dev-1',
          status: 'ACTIVE',
          roles: ['END_USER'],
          tenantId: 't-1',
          assignedProjectIds: ['proj-frontend']
        },
        action: 'scans:create',
        resource: { type: 'scan', projectId: 'proj-backend-core', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PROJECT_NOT_ASSIGNED);
    });

    it('allows END_USER access to resources in their assigned project', () => {
      const decision = engine.evaluate({
        subject: {
          userId: 'dev-1',
          status: 'ACTIVE',
          roles: ['END_USER'],
          tenantId: 't-1',
          assignedProjectIds: ['proj-frontend']
        },
        action: 'scans:create',
        resource: { type: 'scan', projectId: 'proj-frontend', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, true);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
    });

    it('prevents mutative actions on ARCHIVED or DELETED resources', () => {
      const decision = engine.evaluate({
        subject: { userId: 'admin-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 't-1' },
        action: 'findings:update',
        resource: { type: 'finding', id: 'f-1', status: 'ARCHIVED', tenantId: 't-1' }
      });
      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.RESOURCE_IMMUTABLE);
    });

    it('requires elevated role (TENANT_SUPER_ADMIN or PLATFORM_ADMIN) to delete TIER_1_CRITICAL assets', () => {
      // SECURITY_MANAGER has assets:delete permission, but ABAC asset criticality guard blocks TIER_1_CRITICAL
      const managerDecision = engine.evaluate({
        subject: { userId: 'mgr-1', status: 'ACTIVE', roles: ['SECURITY_MANAGER'], tenantId: 't-1' },
        action: 'assets:delete',
        resource: { type: 'asset', id: 'a-crit', criticality: 'TIER_1_CRITICAL', tenantId: 't-1' }
      });
      assert.strictEqual(managerDecision.allowed, false);
      assert.strictEqual(managerDecision.reason, PolicyDecisionReason.ELEVATED_ROLE_REQUIRED);

      // Super Admin succeeds
      const adminDecision = engine.evaluate({
        subject: { userId: 'super-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 't-1' },
        action: 'assets:delete',
        resource: { type: 'asset', id: 'a-crit', criticality: 'TIER_1_CRITICAL', tenantId: 't-1' }
      });
      assert.strictEqual(adminDecision.allowed, true);
    });
  });

  describe('6. Middleware Integration: evaluatePolicy()', () => {
    it('records audit event and returns 403 when policy denies access', async () => {
      const recordedEvents = [];
      const mockAuditService = {
        recordEvent: async (evt) => recordedEvents.push(evt)
      };
      const middleware = createAuthorizeMiddleware(mockAuditService, engine);

      const guard = middleware.evaluatePolicy('assets:delete', (req) => ({
        type: 'asset',
        id: req.params.id,
        criticality: 'TIER_1_CRITICAL',
        tenantId: req.principal.tenantId
      }));

      const req = {
        id: 'req-test-1',
        principal: { userId: 'mgr-1', roles: ['SECURITY_MANAGER'], tenantId: 'tenant-1' },
        params: { id: 'asset-critical-1' },
        headers: {},
        ip: '127.0.0.1'
      };

      let status = null;
      let body = null;
      const res = {
        status(code) { status = code; return this; },
        json(data) { body = data; return this; }
      };

      let nextCalled = false;
      await guard(req, res, () => { nextCalled = true; });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(status, 403);
      assert.strictEqual(body.error.reason, PolicyDecisionReason.ELEVATED_ROLE_REQUIRED);
      assert.strictEqual(recordedEvents.length, 1);
      assert.strictEqual(recordedEvents[0].actor.userId, 'mgr-1');
    });
  });
});
