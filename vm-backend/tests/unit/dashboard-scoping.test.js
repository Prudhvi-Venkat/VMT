'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const DashboardService = require('../../src/application/services/dashboard.service');
const { ScanFinding } = require('../../src/domain/entities/scan-finding.entity');

describe('DATA-001: End User Dashboard Scoping & ScanFinding Entity', () => {
  it('should instantiate ScanFinding with projectId and assetId', () => {
    const finding = new ScanFinding({
      tenantId: 'tenant_test',
      scanId: 'scan_123',
      projectId: 'proj_alpha',
      assetId: 'asset_web',
      componentId: 'comp_456',
      vulnerabilityId: 'CVE-2026-1234'
    });

    assert.strictEqual(finding.projectId, 'proj_alpha');
    assert.strictEqual(finding.assetId, 'asset_web');
    assert.strictEqual(finding.tenantId, 'tenant_test');
  });

  it('should isolate findings in getMeDashboard strictly to assigned projects or user', async () => {
    const tenantId = 'tenant_test';
    const userId = 'usr_alice';

    // Mock project repository
    const mockProjectRepo = {
      async findByTenant(tid) {
        return [
          { id: 'proj_alpha', name: 'Alpha', ownerUserId: 'usr_alice', members: [] },
          { id: 'proj_beta', name: 'Beta', ownerUserId: 'usr_bob', members: [] }
        ];
      }
    };

    // Mock finding repository with findings across multiple projects
    const mockFindingRepo = {
      async findByTenant(tid) {
        return {
          items: [
            new ScanFinding({
              id: 'find_1',
              tenantId,
              scanId: 'scan_1',
              projectId: 'proj_alpha',
              componentId: 'comp_1',
              vulnerabilityId: 'CVE-2026-0001',
              vulnerabilitySnapshot: { severity: 'CRITICAL', cvssScore: 9.8 }
            }),
            new ScanFinding({
              id: 'find_2',
              tenantId,
              scanId: 'scan_2',
              projectId: 'proj_beta', // Should NOT be visible to Alice
              componentId: 'comp_2',
              vulnerabilityId: 'CVE-2026-0002',
              vulnerabilitySnapshot: { severity: 'CRITICAL', cvssScore: 9.9 }
            }),
            new ScanFinding({
              id: 'find_3',
              tenantId,
              scanId: 'scan_3',
              projectId: null, // No project, not assigned -> Should NOT leak
              componentId: 'comp_3',
              vulnerabilityId: 'CVE-2026-0003',
              vulnerabilitySnapshot: { severity: 'HIGH', cvssScore: 8.5 }
            }),
            new ScanFinding({
              id: 'find_4',
              tenantId,
              scanId: 'scan_4',
              projectId: 'proj_beta',
              assignedTo: 'usr_alice', // Assigned to Alice directly -> Should be visible
              componentId: 'comp_4',
              vulnerabilityId: 'CVE-2026-0004',
              vulnerabilitySnapshot: { severity: 'HIGH', cvssScore: 8.0 }
            })
          ],
          total: 4
        };
      }
    };

    const dashboardService = new DashboardService({
      projectRepository: mockProjectRepo,
      scanFindingRepository: mockFindingRepo
    });

    const result = await dashboardService.getMeDashboard(tenantId, userId);

    assert.strictEqual(result.summary.accessibleProjectsCount, 1);
    assert.strictEqual(result.summary.assignedFindingsCount, 2); // find_1 (proj_alpha) + find_4 (assigned)
    const findingIds = result.urgentFindings.map(f => f.id);
    assert.ok(findingIds.includes('find_1'));
    assert.ok(findingIds.includes('find_4'));
    assert.ok(!findingIds.includes('find_2'), 'Should not leak findings from unassigned proj_beta');
    assert.ok(!findingIds.includes('find_3'), 'Should not leak findings without projectId');
  });
});
