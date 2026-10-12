'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MongoProjectRepository = require('../../src/infrastructure/repositories/mongodb-project.repository');
const MemoryAuditRepository = require('../../src/infrastructure/repositories/memory-audit.repository');
const { AuditEvent } = require('../../src/domain/entities/audit-event.entity');
const DashboardService = require('../../src/application/services/dashboard.service');
const TenantManagementService = require('../../src/application/services/tenant-management.service');
const VulnerabilityMatchingService = require('../../src/application/services/vulnerability-matching.service');
const VersionMatchingService = require('../../src/application/services/version-matching.service');
const { RolePermissionPolicy } = require('../../src/domain/policies/role-permission-policy');

describe('Phase 1: Core Flows & Tenant Isolation Unit Tests', () => {
  it('DATA-003: MongoProjectRepository.findByTenant exists and returns same structure as list', async () => {
    const mockDbManager = {
      client: {},
      getTenantDb: () => ({
        collection: () => ({
          find: () => ({
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  toArray: async () => [
                    { id: 'proj_1', name: 'P1', key: 'p1' },
                    { id: 'proj_2', name: 'P2', key: 'p2' }
                  ]
                })
              })
            })
          }),
          countDocuments: async () => 2
        })
      })
    };

    const repo = new MongoProjectRepository(mockDbManager);
    assert.strictEqual(typeof repo.findByTenant, 'function');
    const result = await repo.findByTenant('tenant_acme', { limit: 10 });
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.items.length, 2);
    assert.strictEqual(result.items[0].id, 'proj_1');
  });

  it('DATA-003: DashboardService supports findByTenant returning paginated object', async () => {
    const mockProjectRepo = {
      async findByTenant(tid) {
        return {
          items: [{ id: 'proj_10', name: 'Project 10', key: 'p10' }],
          total: 1
        };
      }
    };

    const mockScanRepo = {
      async findByTenant() {
        return { items: [], total: 0 };
      }
    };

    const mockFindingRepo = {
      async findByTenant() {
        return { items: [], total: 0 };
      }
    };

    const service = new DashboardService({
      projectRepository: mockProjectRepo,
      scanRepository: mockScanRepo,
      scanFindingRepository: mockFindingRepo
    });

    const dash = await service.getTenantDashboard('tenant_test');
    assert.strictEqual(dash.overview.totalProjects, 1);
  });

  it('DATA-006: MemoryAuditRepository supports findByTenantId', async () => {
    const repo = new MemoryAuditRepository();
    await repo.save(new AuditEvent({
      id: 'aud_1',
      tenantId: 'tenant_alpha',
      action: 'auth.login.success',
      actor: { userId: 'usr_1' }
    }));
    await repo.save(new AuditEvent({
      id: 'aud_2',
      tenantId: 'tenant_beta',
      action: 'auth.login.success',
      actor: { userId: 'usr_2' }
    }));

    const res = await repo.findByTenantId('tenant_alpha');
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.items[0].id, 'aud_1');
  });

  it('DATA-008: TenantManagementService performs soft delete on assets', async () => {
    const service = new TenantManagementService({});
    const created = await service.createAsset('tenant_test', {
      name: 'WebServer-01',
      type: 'server',
      environment: 'production'
    }, 'usr_admin');

    assert.strictEqual(created.isActive, true);
    assert.strictEqual(created.status, 'ACTIVE');

    const delResult = await service.deleteAsset('tenant_test', created.id, 'usr_admin');
    assert.strictEqual(delResult.success, true);

    // List assets should now exclude the soft-deleted asset
    const list = await service.listAssets('tenant_test');
    assert.strictEqual(list.length, 0);

    // Directly inspecting the stored asset verifies it was soft-deleted, not removed
    const stored = service.inMemoryAssets.get(created.id);
    assert.ok(stored);
    assert.strictEqual(stored.isActive, false);
    assert.strictEqual(stored.status, 'DECOMMISSIONED');
    assert.ok(stored.deletedAt);
  });

  it('RBAC-001: findings:assign is granted to TSA and TA but denied to END_USER', () => {
    assert.strictEqual(RolePermissionPolicy.hasPermission(['findings:assign'], 'findings:assign'), true);
    const endUserPerms = RolePermissionPolicy.getPermissionsForRoles(['END_USER']);
    assert.strictEqual(endUserPerms.includes('findings:assign'), false);

    const tsaPerms = RolePermissionPolicy.getPermissionsForRoles(['TENANT_SUPER_ADMIN']);
    assert.strictEqual(tsaPerms.includes('findings:assign'), true);

    const secMgrPerms = RolePermissionPolicy.getPermissionsForRoles(['SECURITY_MANAGER']);
    assert.strictEqual(secMgrPerms.includes('findings:assign'), true);
  });

  it('INFRA-003: VulnerabilityMatchingService handles pipeline stage 03 component shape', async () => {
    const versionMatchingService = new VersionMatchingService();

    const pipelineComponentDoc = {
      _id: 'comp_hash_123',
      name: 'express',
      ecosystem: 'npm',
      vulnerabilities: [
        {
          vulnerability_id: 'CVE-2024-9999',
          identifiers: { cve: ['CVE-2024-9999'] },
          version_targeting: {
            strategy: 'explicit',
            explicit_versions: ['4.17.1'],
            affects_all_versions: false
          },
          source: 'NVD'
        }
      ]
    };

    const lookupMap = new Map();
    lookupMap.set('express', pipelineComponentDoc);

    const mockRepo = {
      async batchFindComponents() {
        return lookupMap;
      },
      async findPackageCatalogEntries() {
        return [];
      }
    };

    const service = new VulnerabilityMatchingService({
      vulnerabilityIntelligenceRepository: mockRepo,
      versionMatchingService
    });

    const components = [{ name: 'express', version: '4.17.1', ecosystem: 'npm' }];
    const matches = await service.matchComponents(components);

    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].matchedCves.length, 1);
    assert.strictEqual(matches[0].matchedCves[0].cveId, 'CVE-2024-9999');
  });
});
