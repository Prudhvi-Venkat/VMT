'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');
const { tenantDbManager } = require('../../src/infrastructure/database/tenant-database-manager');

describe('Enterprise Features: Management, Assets, and Finding Assignment', () => {
  let testEnv;
  let platformToken;
  let tenantToken;
  const runId = Date.now();
  const testTenantKey = `cybercorp-${runId}`;
  const testSuperAdminEmail = `alice_${runId}@cybercorp.com`;
  const testPlatformAdminEmail = `bob_${runId}@platform.local`;
  const testDevEmail = `dev_${runId}@cybercorp.com`;
  const testRbacEmail = `rbac_${runId}@cybercorp.com`;
  const testSecurityManagerEmail = `secmgr_${runId}@cybercorp.com`;

  before(async () => {
    await tenantDbManager.connect();
    testEnv = await createTestServer();

    // Login as platform admin
    const pLoginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEnv.platformAdmin.email,
        password: testEnv.adminPassword
      })
    });
    const pLoginBody = await pLoginRes.json();
    platformToken = pLoginBody.accessToken;
  });

  after(async () => {
    if (testEnv) {
      await testEnv.close();
    }
  });

  it('POST /api/v1/auth/register-tenant-super-admin - registers a new tenant with super admin', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/register-tenant-super-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantName: 'CyberCorp Global',
        tenantKey: testTenantKey,
        adminName: 'Alice Chief',
        adminEmail: testSuperAdminEmail,
        adminPassword: 'Password123!',
        environment: 'Production'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.tenant.tenantKey, testTenantKey);
    assert.equal(body.data.superAdmin.email, testSuperAdminEmail);

    // Login as the newly created tenant super admin
    const tLoginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testSuperAdminEmail,
        password: 'Password123!'
      })
    });
    assert.equal(tLoginRes.status, 200);
    const tLoginBody = await tLoginRes.json();
    tenantToken = tLoginBody.accessToken;
    assert.ok(tenantToken);
  });

  it('POST /api/v1/platform/platform-admins - platform admin registers another platform admin', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/platform/platform-admins`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformToken}`
      },
      body: JSON.stringify({
        name: 'Bob Platform Admin',
        email: testPlatformAdminEmail,
        password: 'Password123!'
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.email, testPlatformAdminEmail);
  });

  it('GET /api/v1/platform/platform-admins - lists platform admins', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/platform/platform-admins`, {
      headers: { Authorization: `Bearer ${platformToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 2);
  });

  it('Asset Management CRUD: creates, lists, updates, and deletes an asset in a tenant', async () => {
    // 1. Create asset
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        name: 'Payment Gateway Kubernetes Cluster',
        type: 'KUBERNETES_CLUSTER',
        environment: 'PRODUCTION',
        criticality: 'CRITICAL',
        exposure: 'INTERNET_FACING',
        ipAddress: '198.51.100.42',
        hostname: 'k8s-prod-pay.acme.internal',
        owner: 'SecOps Team',
        projectName: 'Payment Gateway'
      })
    });

    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    assert.ok(createBody.data.id);
    const assetId = createBody.data.id;

    // 2. List assets
    const listRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/assets`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.success, true);
    assert.ok(Array.isArray(listBody.data));
    assert.ok(listBody.data.some(a => a.id === assetId));

    // 3. Update asset
    const updateRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/assets/${assetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        criticality: 'HIGH',
        owner: 'Infrastructure SecOps'
      })
    });
    assert.equal(updateRes.status, 200);
    const updateBody = await updateRes.json();
    assert.equal(updateBody.data.criticality, 'HIGH');
    assert.equal(updateBody.data.owner, 'Infrastructure SecOps');

    // 4. Delete asset
    const deleteRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/assets/${assetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(deleteRes.status, 200);
  });

  it('PATCH /api/v1/findings/:findingId/assign - assigns finding to user', async () => {
    const { ScanFinding } = require('../../src/domain/entities/scan-finding.entity');
    const dummyFinding = new ScanFinding({
      id: 'find_dummy_123',
      tenantId: testTenantKey,
      scanId: 'scan_dummy_01',
      componentId: 'comp_dummy_01',
      vulnerabilityId: 'CVE-2026-9999'
    });
    await testEnv.scanFindingRepository.saveMany(testTenantKey, 'scan_dummy_01', [dummyFinding]);

    const assignRes = await fetch(`${testEnv.baseUrl}/api/v1/findings/find_dummy_123/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        assignedTo: 'usr_dev_01',
        assignedUserName: 'Dev Engineer 01'
      })
    });

    assert.equal(assignRes.status, 200);
    const assignBody = await assignRes.json();
    assert.equal(assignBody.success, true);
    assert.equal(assignBody.data.assignedTo, 'usr_dev_01');
    assert.equal(assignBody.data.assignedUserName, 'Dev Engineer 01');
  });

  it('User lifecycle & deactivation: creates user and toggles status (G1)', async () => {
    // 1. Provision user
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        email: testDevEmail,
        password: 'Password123!',
        name: 'Dev Engineer',
        roles: ['END_USER']
      })
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    const userId = createBody.data.id;

    // 2. Deactivate user
    const deactRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({ status: 'DISABLED' })
    });
    assert.equal(deactRes.status, 200);

    // 3. Reactivate user
    const reactRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users/${userId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({ status: 'ACTIVE' })
    });
    assert.equal(reactRes.status, 200);
  });

  it('Tenant lifecycle: platform admin updates tenant status (G2)', async () => {
    // Suspend tenant
    const suspendRes = await fetch(`${testEnv.baseUrl}/api/v1/platform/tenants/${testTenantKey}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformToken}`
      },
      body: JSON.stringify({ status: 'SUSPENDED', reason: 'Audit maintenance' })
    });
    assert.equal(suspendRes.status, 200);
    const suspendBody = await suspendRes.json();
    assert.equal(suspendBody.data.status, 'SUSPENDED');

    // Reactivate tenant
    const reactivateRes = await fetch(`${testEnv.baseUrl}/api/v1/platform/tenants/${testTenantKey}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformToken}`
      },
      body: JSON.stringify({ status: 'ACTIVE', reason: 'Maintenance complete' })
    });
    assert.equal(reactivateRes.status, 200);
    const reactivateBody = await reactivateRes.json();
    assert.equal(reactivateBody.data.status, 'ACTIVE');
  });

  it('RBAC Enforcement: END_USER role is denied access to tenant administration and asset creation (G7, G8)', async () => {
    // 1. Create a project to assign
    const createProjRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        name: 'Internal Portal',
        key: `int-portal-${runId}`,
        stage: 'PROD'
      })
    });
    const projData = await createProjRes.json();
    const projectId = projData.data.id;

    // 2. Provision dev.engineer with assigned project
    const createDevRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        email: testRbacEmail,
        password: 'Password123!',
        name: 'Dev RBAC',
        roles: ['END_USER'],
        assignedProjectIds: [projectId]
      })
    });
    assert.equal(createDevRes.status, 201);

    // 3. Log in as dev.rbac (END_USER)
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testRbacEmail,
        password: 'Password123!'
      })
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    const endUserToken = loginBody.accessToken;
    assert.ok(endUserToken);

    // 2. END_USER must be rejected when attempting to read tenant users (requires tenant:users:read)
    const usersRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users`, {
      headers: { Authorization: `Bearer ${endUserToken}` }
    });
    assert.equal(usersRes.status, 403, 'END_USER should receive 403 on GET /tenant/users');

    // 3. END_USER must be rejected when attempting to create assets (requires assets:create)
    const assetCreateRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${endUserToken}`
      },
      body: JSON.stringify({
        name: 'Unauthorized Server',
        type: 'SERVER',
        environment: 'PRODUCTION',
        criticality: 'HIGH',
        exposure: 'INTERNAL'
      })
    });
    assert.equal(assetCreateRes.status, 403, 'END_USER should receive 403 on POST /tenant/assets');
  });

  it('Integrations management: lists integrations for authenticated tenant (G18)', async () => {
    const listRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.success, true);
    assert.ok(Array.isArray(listBody.data));
  });

  it('SCM Integrations: full CRUD lifecycle (create, get, repositories, update, delete)', async () => {
    // 1. Create integration
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        name: 'GitLab Enterprise Main',
        type: 'GITLAB',
        credentials: {
          token: 'glpat_testtoken123456789'
        },
        config: { hostUrl: 'https://gitlab.example.com', groupPath: 'cybercorp' }
      })
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.equal(createBody.success, true);
    const intId = createBody.data.id;
    assert.ok(intId);

    // 2. Get integration by id
    const getRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${intId}`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.data.id, intId);
    assert.equal(getBody.data.name, 'GitLab Enterprise Main');

    // 3. List repositories for integration
    const reposRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${intId}/repositories`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(reposRes.status, 200);
    const reposBody = await reposRes.json();
    assert.equal(reposBody.success, true);
    assert.ok(Array.isArray(reposBody.data));

    // 4. Update integration
    const updateRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${intId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({ name: 'GitLab Enterprise Updated' })
    });
    assert.equal(updateRes.status, 200);
    const updateBody = await updateRes.json();
    assert.equal(updateBody.data.name, 'GitLab Enterprise Updated');

    // 5. Delete (disable) integration
    const delRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${intId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(delRes.status, 200);
    const delBody = await delRes.json();
    assert.equal(delBody.success, true);
  });

  it('Findings routes: direct list and detail endpoints with pagination support', async () => {
    // 1. List findings with page and limit
    const listRes = await fetch(`${testEnv.baseUrl}/api/v1/findings?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(Array.isArray(listBody.items));
    assert.equal(listBody.pagination.page, 1);
    assert.equal(listBody.pagination.limit, 10);

    // 2. Detail for non-existent finding returns 404
    const detailRes = await fetch(`${testEnv.baseUrl}/api/v1/findings/non-existent-finding-123`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });
    assert.equal(detailRes.status, 404);
  });

  it('SECURITY_MANAGER: tenant-wide scan/finding/audit access without management rights', async () => {
    // 1. Provision the new role (validator must accept it)
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        email: testSecurityManagerEmail,
        password: 'Password123!',
        name: 'Security Manager',
        roles: ['SECURITY_MANAGER']
      })
    });
    assert.equal(createRes.status, 201);
    const createBody = await createRes.json();
    assert.deepEqual(createBody.data.roles, ['SECURITY_MANAGER']);

    // 2. Login as the new role
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testSecurityManagerEmail, password: 'Password123!' })
    });
    assert.equal(loginRes.status, 200);
    const loginBody = await loginRes.json();
    const secManagerToken = loginBody.accessToken;
    assert.ok(secManagerToken);

    // 3. Allowed: tenant-wide reads + audit
    for (const path of ['/api/v1/scans?active=true', '/api/v1/findings?active=true', '/api/v1/tenant/audit', '/api/v1/tenant/assets']) {
      const res = await fetch(`${testEnv.baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${secManagerToken}` }
      });
      assert.equal(res.status, 200, `SECURITY_MANAGER should be allowed on ${path}`);
    }

    // 4. Denied: user and project management
    const usersRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/users`, {
      headers: { Authorization: `Bearer ${secManagerToken}` }
    });
    assert.equal(usersRes.status, 403, 'SECURITY_MANAGER must not read the user directory');

    const projCreateRes = await fetch(`${testEnv.baseUrl}/api/v1/tenant/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secManagerToken}`
      },
      body: JSON.stringify({ name: 'Unauthorized Project', key: `nope-${runId}` })
    });
    assert.equal(projCreateRes.status, 403, 'SECURITY_MANAGER must not create projects');
  });
});
