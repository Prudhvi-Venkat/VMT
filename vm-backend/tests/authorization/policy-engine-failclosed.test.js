'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  AuthorizationPolicyEngine,
  PolicyDecisionReason,
  GLOBAL_RESOURCE_TYPES
} = require('../../src/domain/policies/authorization-policy-engine');

describe('P0: Authorization Policy Fail-Closed & Explicit Resource Semantics', () => {
  const engine = new AuthorizationPolicyEngine();

  it('denies action when subject tenantId is missing for a tenant user', () => {
    const decision = engine.evaluate({
      subject: { userId: 'usr-1', status: 'ACTIVE', roles: ['END_USER'], scope: 'tenant' }, // missing tenantId
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1', tenantId: 'tenant-a' }
    });

    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, PolicyDecisionReason.TENANT_CONTEXT_REQUIRED);
  });

  it('denies action when resource tenantId is missing for a tenant-scoped resource', () => {
    const decision = engine.evaluate({
      subject: { userId: 'usr-1', status: 'ACTIVE', roles: ['END_USER'], tenantId: 'tenant-a', scope: 'tenant' },
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1' } // missing tenantId on non-global resource
    });

    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, PolicyDecisionReason.AMBIGUOUS_RESOURCE_TENANT);
  });

  it('does not classify a resource as global merely because its tenantId is missing', () => {
    for (const tenantType of ['scan', 'finding', 'asset', 'project', 'user']) {
      const decision = engine.evaluate({
        subject: { userId: 'usr-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 'tenant-a', scope: 'tenant' },
        action: `${tenantType}s:read`,
        resource: { type: tenantType, id: `${tenantType}-1` } // missing tenantId
      });

      assert.strictEqual(decision.allowed, false);
      assert.strictEqual(decision.reason, PolicyDecisionReason.AMBIGUOUS_RESOURCE_TENANT);
    }
  });

  it('denies cross-tenant access when subject and resource tenants mismatch', () => {
    const decision = engine.evaluate({
      subject: { userId: 'usr-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 'tenant-a', scope: 'tenant' },
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1', tenantId: 'tenant-b' }
    });

    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, PolicyDecisionReason.CROSS_TENANT_FORBIDDEN);
  });

  it('permits action when subject and resource tenants match and user has permission', () => {
    const decision = engine.evaluate({
      subject: { userId: 'usr-1', status: 'ACTIVE', roles: ['TENANT_SUPER_ADMIN'], tenantId: 'tenant-a', scope: 'tenant' },
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1', tenantId: 'tenant-a' }
    });

    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
  });

  it('permits tenant subject to read explicitly permitted global resources without resource.tenantId', () => {
    for (const globalType of Array.from(GLOBAL_RESOURCE_TYPES)) {
      const decision = engine.evaluate({
        subject: {
          userId: 'usr-analyst',
          status: 'ACTIVE',
          roles: ['SECURITY_ANALYST'],
          tenantId: 'tenant-a',
          scope: 'tenant',
          permissions: ['intel:read', 'vulnerabilities:read', 'cve:read', 'system:read', 'platform:read']
        },
        action: 'intel:read',
        resource: { type: globalType, id: 'CVE-2026-1001' } // global resource without tenantId
      });

      assert.strictEqual(decision.allowed, true);
      assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
    }
  });

  it('prevents tenant user claiming platform privileges with injected PLATFORM_ADMIN role', () => {
    // Subject has PLATFORM_ADMIN in roles, but scope is 'tenant'
    const decision = engine.evaluate({
      subject: {
        userId: 'usr-sneaky',
        status: 'ACTIVE',
        roles: ['PLATFORM_ADMIN'],
        scope: 'tenant',
        tenantId: 'tenant-a'
      },
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1', tenantId: 'tenant-b' } // cross tenant resource
    });

    // Should NOT be treated as platform subject, must be denied with CROSS_TENANT_FORBIDDEN
    assert.strictEqual(decision.allowed, false);
    assert.strictEqual(decision.reason, PolicyDecisionReason.CROSS_TENANT_FORBIDDEN);
  });

  it('allows verified platform administrator with scope === platform and PLATFORM_ADMIN role', () => {
    const decision = engine.evaluate({
      subject: {
        userId: 'usr-platform-root',
        status: 'ACTIVE',
        roles: ['PLATFORM_ADMIN'],
        scope: 'platform'
      },
      action: 'findings:read',
      resource: { type: 'finding', id: 'f-1', tenantId: 'tenant-b' }
    });

    assert.strictEqual(decision.allowed, true);
    assert.strictEqual(decision.reason, PolicyDecisionReason.PERMITTED);
  });
});
