'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');
const { Scan, ScanStatus } = require('../../src/domain/entities/scan.entity');
const { ScanFinding, FindingStatus } = require('../../src/domain/entities/scan-finding.entity');
const { Session, SessionStatus } = require('../../src/domain/entities/session.entity');
const { Project, ProjectMember, ProjectStatus } = require('../../src/domain/entities/project.entity');
const { tenantDbManager } = require('../../src/infrastructure/database/tenant-database-manager');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const JwtService = require('../../src/infrastructure/security/jwt.service');

describe('HYG-007: Comprehensive Route & Service Integration Tests', () => {
  let testEnv;
  let tenantAdminToken;
  let tenantSuperAdminToken;
  let scanId;
  let findingId;
  const tenantId = 'tenant_hyg_test';

  before(async () => {
    await tenantDbManager.connect();
    testEnv = await createTestServer();

    const { Tenant } = require('../../src/domain/entities/tenant.entity');
    await testEnv.tenantRepository.save(new Tenant({
      tenantKey: tenantId,
      name: 'Hygiene Test Tenant',
      status: 'ACTIVE'
    }));

    // 1. Create a Tenant Admin user
    const tenantAdmin = new User({
      id: 'usr_ta_hyg_01',
      email: 'admin@hyg.test',
      passwordHash: PasswordPolicy.hash('Password#123'),
      status: UserStatus.ACTIVE,
      roles: ['TENANT_ADMIN'],
      scope: 'tenant',
      tenantId
    });
    await testEnv.userRepository.save(tenantAdmin);

    await testEnv.sessionRepository.save(new Session({
      id: 'ses_ta_hyg',
      userId: tenantAdmin.id,
      tenantId,
      platformScope: 'tenant',
      status: SessionStatus.ACTIVE
    }));

    tenantAdminToken = JwtService.signAccessToken({
      userId: tenantAdmin.id,
      sessionId: 'ses_ta_hyg',
      roles: ['TENANT_ADMIN'],
      scope: 'tenant',
      tenantId
    }).token;

    // 2. Create a Tenant Super Admin user
    const tenantSuperAdmin = new User({
      id: 'usr_tsa_hyg_01',
      email: 'superadmin@hyg.test',
      passwordHash: PasswordPolicy.hash('Password#123'),
      status: UserStatus.ACTIVE,
      roles: ['TENANT_SUPER_ADMIN'],
      scope: 'tenant',
      tenantId
    });
    await testEnv.userRepository.save(tenantSuperAdmin);

    await testEnv.sessionRepository.save(new Session({
      id: 'ses_tsa_hyg',
      userId: tenantSuperAdmin.id,
      tenantId,
      platformScope: 'tenant',
      status: SessionStatus.ACTIVE
    }));

    tenantSuperAdminToken = JwtService.signAccessToken({
      userId: tenantSuperAdmin.id,
      sessionId: 'ses_tsa_hyg',
      roles: ['TENANT_SUPER_ADMIN'],
      scope: 'tenant',
      tenantId
    }).token;

    // 3. Seed a Project
    const project = new Project({
      id: 'proj_hyg_01',
      tenantId,
      name: 'Hygiene Core Service',
      key: 'HCS',
      status: ProjectStatus.ACTIVE,
      ownerUserId: tenantSuperAdmin.id,
      createdBy: tenantSuperAdmin.id
    });
    await testEnv.projectRepository.save(tenantId, project);
    await testEnv.projectRepository.addMember(tenantId, new ProjectMember({
      projectId: 'proj_hyg_01',
      userId: tenantAdmin.id,
      role: 'MEMBER'
    }));

    // 4. Seed a Scan
    const scan = new Scan({
      tenantId,
      createdBy: tenantAdmin.id,
      projectId: 'proj_hyg_01',
      name: 'package.json',
      originalFileName: 'package.json',
      fileSize: 120,
      checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: ScanStatus.COMPLETED
    });
    await testEnv.scanRepository.save(scan);
    scanId = scan.id;

    // 5. Seed a Finding
    const finding = new ScanFinding({
      id: 'find_hyg_001',
      tenantId,
      scanId,
      projectId: 'proj_hyg_01',
      componentId: 'comp_hyg_001',
      vulnerabilityId: 'CVE-2026-9999',
      status: FindingStatus.OPEN,
      vulnerabilitySnapshot: {
        title: 'Buffer Overflow',
        severity: 'HIGH',
        cveId: 'CVE-2026-9999',
        cvssScore: 8.5
      },
      componentSnapshot: {
        name: 'test-lib',
        version: '1.0.0',
        ecosystem: 'npm'
      }
    });
    await testEnv.scanFindingRepository.saveMany(tenantId, scanId, [finding]);
    findingId = finding.id;
  });

  after(async () => {
    await testEnv.close();
  });

  // ─── 1. Health & Docs Routes ─────────────────────────────────────────────
  it('GET /health - returns 200 with platform health details', async () => {
    const res = await fetch(`${testEnv.baseUrl}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'HEALTHY');
    assert.ok(data.timestamp);
  });

  it('GET /api/docs/openapi.json - returns OpenAPI specification', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/docs/openapi.json`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.openapi || data.swagger);
    assert.ok(data.info);
  });

  // ─── 2. Scan Operations (Cancel & Raw) ───────────────────────────────────
  it('POST /api/v1/scans/:scanId/cancel - cancels an in-flight or active scan', async () => {
    // Create an in-flight scan
    const inFlightScan = new Scan({
      tenantId,
      createdBy: 'usr_ta_hyg_01',
      originalFileName: 'in-flight.json',
      fileSize: 100,
      checksum: 'dummy-checksum',
      status: ScanStatus.PARSING
    });
    await testEnv.scanRepository.save(inFlightScan);

    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${inFlightScan.id}/cancel`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status || data.data?.status, 'CANCELLED');
  });

  it('GET /api/v1/scans/:scanId/raw - returns 404 when raw file not on disk', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/raw`, {
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`
      }
    });
    // In-memory / mock repo without physical disk artifact returns 404
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.error.code, 'ARTIFACT_NOT_FOUND');
  });

  // ─── 3. Finding Mutations (Status & Assign) ──────────────────────────────
  it('PATCH /api/v1/findings/:findingId/status - updates status according to state machine', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/findings/${findingId}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'IN_PROGRESS',
        reason: 'Remediation triage underway'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.data.newStatus || data.data.status, 'IN_PROGRESS');
  });

  it('POST /api/v1/findings/:findingId/assign - assigns finding to user', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/findings/${findingId}/assign`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assignedTo: 'usr_ta_hyg_01',
        assignedUserName: 'Admin Hyg'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.data.assignedTo, 'usr_ta_hyg_01');
  });

  // ─── 4. Project Administration (Status & Members & Dashboard) ────────────
  it('GET /api/v1/projects/:projectId/dashboard - returns project aggregate metrics', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/projects/proj_hyg_01/dashboard`, {
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`
      }
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.data);
    assert.ok(data.data.metrics);
  });

  it('PATCH /api/v1/tenant/projects/:projectId/status - updates project status', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/tenant/projects/proj_hyg_01/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'inactive'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.data.status, 'DISABLED');
  });

  it('POST /api/v1/tenant/projects/:projectId/members - assigns project member', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/tenant/projects/proj_hyg_01/members`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: 'usr_new_member_01'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.data.userId, 'usr_new_member_01');
  });

  // ─── 5. Integration Endpoints (Test & Repository Scan) ───────────────────
  it('POST /api/v1/integrations/:id/test - tests integration connectivity', async () => {
    // First create an integration
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantSuperAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'GITLAB',
        name: 'GitLab SecOps',
        credentials: { token: 'glpat_test_token' },
        config: { hostUrl: 'https://gitlab.example.com', groupPath: 'acme-corp' }
      })
    });
    assert.equal(createRes.status, 201);
    const { data: createdIntegration } = await createRes.json();

    // Test connectivity
    const testRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${createdIntegration.id}/test`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantSuperAdminToken}`
      }
    });

    assert.equal(testRes.status, 200);
    const testData = await testRes.json();
    assert.equal(testData.success, true);
    assert.equal(testData.data.status, 'CONNECTED');
  });

  it('POST /api/v1/integrations/:id/repositories/:repoId/scan - triggers integration scan', async () => {
    // Create an integration
    const createRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantSuperAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'GITLAB',
        name: 'GitLab Scanner',
        credentials: { token: 'glpat_test' },
        config: { hostUrl: 'https://gitlab.example.com', groupPath: 'core' }
      })
    });
    assert.equal(createRes.status, 201);
    const { data: integration } = await createRes.json();

    const scanRes = await fetch(`${testEnv.baseUrl}/api/v1/integrations/${integration.id}/repositories/repo_core_api/scan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantSuperAdminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        branch: 'main'
      })
    });

    assert.equal(scanRes.status, 400);
    const scanData = await scanRes.json();
    assert.equal(scanData.error.message, 'Repository scans currently require a GitHub integration');
  });
});
