'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const MemoryScanRepository = require('../../src/infrastructure/repositories/memory-scan.repository');
const MemoryScanFindingRepository = require('../../src/infrastructure/repositories/memory-scan-finding.repository');
const { Scan, ACTIVE_SCAN_STATUSES } = require('../../src/domain/entities/scan.entity');
const { FindingStatus, ACTIVE_FINDING_STATUSES } = require('../../src/domain/entities/scan-finding.entity');

const TENANT = 'tenant_active_test';

function scanWith(status, id) {
  return new Scan({
    id,
    tenantId: TENANT,
    originalFileName: `${id}.json`,
    status
  });
}

describe('Active status filtering (SECURITY_MANAGER oversight)', () => {
  it('defines the agreed active status sets', () => {
    assert.deepEqual(ACTIVE_SCAN_STATUSES, ['QUEUED', 'PARSING', 'NORMALIZING', 'MATCHING', 'ENRICHING']);
    assert.deepEqual(ACTIVE_FINDING_STATUSES, [FindingStatus.OPEN, FindingStatus.TRIAGED, FindingStatus.IN_PROGRESS]);
  });

  it('memory scan repo: active=true returns only in-flight scans, explicit status wins', async () => {
    const repo = new MemoryScanRepository();
    const statuses = [
      'QUEUED', 'PARSING', 'NORMALIZING', 'MATCHING', 'ENRICHING',
      'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED'
    ];
    for (const [i, s] of statuses.entries()) {
      await repo.save(scanWith(s, `scan_${i}`));
    }

    const all = await repo.findByTenant(TENANT, {});
    assert.equal(all.total, statuses.length);

    const active = await repo.findByTenant(TENANT, { active: true });
    assert.equal(active.total, ACTIVE_SCAN_STATUSES.length);
    assert.ok(active.items.every(s => ACTIVE_SCAN_STATUSES.includes(s.status)));

    const explicit = await repo.findByTenant(TENANT, { active: true, status: 'COMPLETED' });
    assert.equal(explicit.total, 1);
    assert.equal(explicit.items[0].status, 'COMPLETED');
  });

  it('memory finding repo: active=true returns only open findings, explicit status wins', async () => {
    const repo = new MemoryScanFindingRepository();
    const statuses = [
      'OPEN', 'TRIAGED', 'IN_PROGRESS', 'MITIGATED',
      'RESOLVED', 'FALSE_POSITIVE', 'ACCEPTED_RISK'
    ];
    await repo.saveMany(TENANT, 'scan_1', statuses.map((s, i) => ({
      id: `f_${i}`,
      componentId: `c_${i}`,
      cveId: `CVE-2026-${1000 + i}`,
      status: s,
      vulnerabilitySnapshot: { severity: 'HIGH', cvssScore: 7.5 },
      componentSnapshot: { name: 'lodash', ecosystem: 'npm' }
    })));

    const all = await repo.findByTenant(TENANT, {});
    assert.equal(all.total, statuses.length);

    const active = await repo.findByTenant(TENANT, { active: true });
    assert.equal(active.total, ACTIVE_FINDING_STATUSES.length);
    assert.ok(active.items.every(f => ACTIVE_FINDING_STATUSES.includes(f.status)));

    const explicit = await repo.findByTenant(TENANT, { active: true, status: 'RESOLVED' });
    assert.equal(explicit.total, 1);
    assert.equal(explicit.items[0].status, 'RESOLVED');
  });
});
