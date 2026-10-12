'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const createApp = require('../../src/app');
const { tenantDbManager } = require('../../src/infrastructure/database/tenant-database-manager');
const MongoUserRepository = require('../../src/infrastructure/repositories/mongodb-user.repository');
const MongoSessionRepository = require('../../src/infrastructure/repositories/mongodb-session.repository');
const MongoAuditRepository = require('../../src/infrastructure/repositories/mongodb-audit.repository');
const MongoScanRepository = require('../../src/infrastructure/repositories/mongodb-scan.repository');
const MongoScanComponentRepository = require('../../src/infrastructure/repositories/mongodb-scan-component.repository');
const MongoScanFindingRepository = require('../../src/infrastructure/repositories/mongodb-scan-finding.repository');
const MongoVulnerabilityIntelligenceRepository = require('../../src/infrastructure/repositories/mongodb-vulnerability-intelligence.repository');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');

describe('Multi-Tenant Database-per-Tenant Isolation Tests', () => {
  let server;
  let baseUrl;
  let platformAdminToken;
  let tenantASuperAdminToken;
  let tenantBSuperAdminToken;
  let tenantAUserToken;
  let tenantBUserToken;

  before(async () => {
    await tenantDbManager.connect();
    const platformDb = tenantDbManager.getPlatformDb();

    const userRepository = new MongoUserRepository(platformDb, 'platform_users');
    const sessionRepository = new MongoSessionRepository(platformDb, 'platform_sessions');
    const auditRepository = new MongoAuditRepository(platformDb);
    const scanRepository = new MongoScanRepository();
    const scanComponentRepository = new MongoScanComponentRepository();
    const scanFindingRepository = new MongoScanFindingRepository();
    const vulnerabilityIntelligenceRepository = new MongoVulnerabilityIntelligenceRepository(tenantDbManager.getIntelligenceDb());

    // Seed platform admin
    const adminUser = new User({
      id: 'usr_platform_admin_test',
      email: 'admin_test@platform.local',
      passwordHash: PasswordPolicy.hash('PlatformAdmin#2026!'),
      status: UserStatus.ACTIVE,
      roles: ['PLATFORM_ADMIN'],
      scope: 'platform'
    });
    await userRepository.save(adminUser);

    const { app } = createApp({
      userRepository,
      sessionRepository,
      auditRepository,
      scanRepository,
      scanComponentRepository,
      scanFindingRepository,
      vulnerabilityIntelligenceRepository
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    // Login as platform admin
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin_test@platform.local', password: 'PlatformAdmin#2026!' })
    });
    assert.strictEqual(loginRes.status, 200);
    const loginData = await loginRes.json();
    platformAdminToken = loginData.accessToken;
  });

  after(async () => {
    if (server) {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await tenantDbManager.close();
  });

  const testTimestamp = Date.now();
  const alphaKey = `t-alpha-${testTimestamp}`;
  const betaKey = `t-beta-${testTimestamp}`;

  it('Platform Admin can create Tenant Alpha and Tenant Beta with isolated databases', async () => {
    // 1. Create Tenant Alpha
    const resA = await fetch(`${baseUrl}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformAdminToken}`
      },
      body: JSON.stringify({
        tenantKey: alphaKey,
        name: 'Test Alpha Corp',
        superAdminEmail: `super@${alphaKey}.test`,
        superAdminPassword: 'SuperAdmin#2026!'
      })
    });
    assert.strictEqual(resA.status, 201);
    const dataA = await resA.json();
    assert.strictEqual(dataA.data.tenant.tenantKey, alphaKey);
    assert.strictEqual(dataA.data.tenant.databaseName, `security_tenant_${alphaKey}`);

    // 2. Create Tenant Beta
    const resB = await fetch(`${baseUrl}/api/v1/platform/tenants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformAdminToken}`
      },
      body: JSON.stringify({
        tenantKey: betaKey,
        name: 'Test Beta Corp',
        superAdminEmail: `super@${betaKey}.test`,
        superAdminPassword: 'SuperAdmin#2026!'
      })
    });
    assert.strictEqual(resB.status, 201);
  });

  it('Tenant Super Admins can login to their isolated tenant context', async () => {
    // Login as Tenant Alpha Super Admin
    const resA = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `super@${alphaKey}.test`,
        password: 'SuperAdmin#2026!',
        tenantKey: alphaKey
      })
    });
    assert.strictEqual(resA.status, 200);
    const dataA = await resA.json();
    tenantASuperAdminToken = dataA.accessToken;
    assert.strictEqual(dataA.user.tenantId, alphaKey);
    assert.ok(dataA.user.roles.includes('TENANT_SUPER_ADMIN'));

    // Login as Tenant Beta Super Admin
    const resB = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `super@${betaKey}.test`,
        password: 'SuperAdmin#2026!',
        tenantKey: betaKey
      })
    });
    assert.strictEqual(resB.status, 200);
    const dataB = await resB.json();
    tenantBSuperAdminToken = dataB.accessToken;
    assert.strictEqual(dataB.user.tenantId, betaKey);
  });

  it('Tenant Super Admin can create End Users and Enterprise Projects in their tenant database', async () => {
    // Super Admin Alpha creates Project Alpha
    const projRes = await fetch(`${baseUrl}/api/v1/tenant/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantASuperAdminToken}`
      },
      body: JSON.stringify({
        name: 'Alpha Payments',
        key: 'ALPAY',
        description: 'Payments gateway'
      })
    });
    assert.strictEqual(projRes.status, 201);
    const projData = await projRes.json();
    const projectId = projData.data.id;

    // Super Admin Alpha creates End User Alice
    const userRes = await fetch(`${baseUrl}/api/v1/tenant/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantASuperAdminToken}`
      },
      body: JSON.stringify({
        email: 'alice@alpha.test',
        password: 'EndUser#2026!',
        name: 'Alice Analyst',
        assignedProjectIds: [projectId]
      })
    });
    assert.strictEqual(userRes.status, 201);

    // Login as End User Alice
    const loginAlice = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@alpha.test',
        password: 'EndUser#2026!',
        tenantKey: 'test-alpha'
      })
    });
    assert.strictEqual(loginAlice.status, 200);
    const aliceData = await loginAlice.json();
    tenantAUserToken = aliceData.accessToken;
    assert.strictEqual(aliceData.user.tenantId, 'test-alpha');
    assert.ok(aliceData.user.roles.includes('END_USER'));
  });

  it('End User can inspect packages before scan (pre-scan review)', async () => {
    const samplePackageJson = JSON.stringify({
      name: 'alpha-service',
      version: '1.0.0',
      dependencies: {
        'lodash': '4.17.20',
        'axios': '1.7.9'
      }
    });

    const inspectRes = await fetch(`${baseUrl}/api/v1/scans/inspect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAUserToken}`
      },
      body: JSON.stringify({
        filename: 'package.json',
        content: samplePackageJson
      })
    });
    assert.strictEqual(inspectRes.status, 200);
    const inspectData = await inspectRes.json();
    assert.strictEqual(inspectData.success, true);
    assert.strictEqual(inspectData.data.components.length, 2);
    assert.ok(inspectData.data.components.some(c => c.name === 'lodash'));
  });

  it('Cross-tenant data access is strictly forbidden (Tenant B cannot see Tenant A scan or audit logs)', async () => {
    // 1. Alice creates a scan in Tenant Alpha
    const samplePackageJson = JSON.stringify({
      name: 'alpha-app',
      dependencies: { 'lodash': '4.17.20' }
    });

    const scanRes = await fetch(`${baseUrl}/api/v1/scans`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantAUserToken}`
      },
      body: JSON.stringify({
        filename: 'package.json',
        content: samplePackageJson
      })
    });
    assert.strictEqual(scanRes.status, 202);
    const scanData = await scanRes.json();
    const scanId = scanData.scanId;

    // 2. Tenant Beta attempts to access Tenant Alpha's scan -> must return 404
    const crossScanRes = await fetch(`${baseUrl}/api/v1/scans/${scanId}`, {
      headers: {
        Authorization: `Bearer ${tenantBSuperAdminToken}`
      }
    });
    assert.strictEqual(crossScanRes.status, 404);

    // 3. Tenant Beta audit logs do not contain Tenant Alpha actions
    const auditRes = await fetch(`${baseUrl}/api/v1/tenant/audit`, {
      headers: {
        Authorization: `Bearer ${tenantBSuperAdminToken}`
      }
    });
    assert.strictEqual(auditRes.status, 200);
    const auditData = await auditRes.json();
    assert.ok(auditData.data.every(e => e.userId !== 'usr_platform_admin' && e.userId !== 'alice@alpha.test'));

    // Wait for scan to complete cleanly
    for (let i = 0; i < 30; i++) {
      const checkRes = await fetch(`${baseUrl}/api/v1/scans/${scanId}`, {
        headers: { Authorization: `Bearer ${tenantAUserToken}` }
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (checkData.status === 'COMPLETED' || checkData.status === 'FAILED') break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});
