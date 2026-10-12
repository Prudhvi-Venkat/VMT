'use strict';

require('./test-helper');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  adaptFinding,
  adaptScan,
  mapDependencyScope,
  mapFindingStatusToBackend
} = require('../lib/scanner-adapter.ts');

describe('HYG-009, FE-04: Scanner Adapter Unit Tests (lib/scanner-adapter.ts)', () => {
  describe('mapDependencyScope', () => {
    it('correctly maps scope strings to canonical frontend dependency scopes', () => {
      assert.equal(mapDependencyScope('devDependencies'), 'development');
      assert.equal(mapDependencyScope('dev'), 'development');
      assert.equal(mapDependencyScope('optionalDependencies'), 'optional');
      assert.equal(mapDependencyScope('peerDependencies'), 'peer');
      assert.equal(mapDependencyScope('bundleDependencies'), 'bundled');
      assert.equal(mapDependencyScope('dependencies'), 'production');
      assert.equal(mapDependencyScope(undefined), 'production');
      assert.equal(mapDependencyScope(null), 'production');
    });
  });

  describe('mapFindingStatusToBackend', () => {
    it('normalizes frontend finding status names to canonical backend enum values', () => {
      assert.equal(mapFindingStatusToBackend('open'), 'OPEN');
      assert.equal(mapFindingStatusToBackend('in_progress'), 'IN_PROGRESS');
      assert.equal(mapFindingStatusToBackend('remediated'), 'RESOLVED');
      assert.equal(mapFindingStatusToBackend('closed'), 'RESOLVED');
      assert.equal(mapFindingStatusToBackend('false_positive'), 'FALSE_POSITIVE');
      assert.equal(mapFindingStatusToBackend('accepted_risk'), 'ACCEPTED_RISK');
      assert.equal(mapFindingStatusToBackend('assigned'), 'TRIAGED');
      assert.equal(mapFindingStatusToBackend('triaged'), 'TRIAGED');
    });
  });

  describe('adaptScan', () => {
    it('transforms backend serialized scan payload into frontend SbomScan shape', () => {
      const backendScan = {
        scanId: 'scan_123',
        name: 'package.json',
        originalFileName: 'package.json',
        fileType: 'package.json',
        fileSize: 450,
        checksum: 'abc123hash',
        status: 'COMPLETED',
        componentCount: 15,
        vulnerableComponentCount: 3,
        findingCount: 5,
        warningCount: 0,
        warnings: [],
        createdAt: '2026-10-09T08:00:00.000Z',
        completedAt: '2026-10-09T08:00:05.000Z'
      };

      const scan = adaptScan(backendScan);
      assert.ok(scan);
      assert.equal(scan.id, 'scan_123');
      assert.equal(scan.filename, 'package.json');
      assert.equal(scan.status, 'COMPLETED');
      assert.equal(scan.component_count, 15);
      assert.equal(scan.vulnerable_count, 3);
      assert.equal(scan.finding_count, 5);
      assert.equal(scan.size_bytes, 450);
      assert.equal(scan.checksum, 'abc123hash');
    });
  });

  describe('adaptFinding', () => {
    it('transforms backend serialized finding payload into complete frontend Finding shape', () => {
      const backendFinding = {
        findingId: 'find_999',
        component: {
          name: 'lodash',
          version: '4.17.20',
          ecosystem: 'npm',
          purl: 'pkg:npm/lodash@4.17.20',
          scope: 'dependencies'
        },
        vulnerability: {
          cveId: 'CVE-2021-23337',
          aliases: ['GHSA-35jh-r3h4-6jhm'],
          severity: 'HIGH',
          cvssScore: 7.4,
          cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:H',
          epss: 0.15,
          cisaKev: false,
          cwes: ['CWE-94'],
          description: 'Prototype pollution in lodash',
          references: ['https://nvd.nist.gov/vuln/detail/CVE-2021-23337']
        },
        versionEvidence: {
          installedVersion: '4.17.20',
          affectedRange: '<4.17.21',
          fixedVersions: ['4.17.21']
        },
        match: {
          method: 'exact',
          confidence: 1.0,
          matchedIdentifier: 'lodash'
        },
        status: 'OPEN',
        risk: {
          score: 72,
          severity: 'HIGH',
          factors: {
            cvss: 37,
            epss: 3,
            exploit: 0,
            criticality: 8,
            exposure: 2
          }
        },
        remediation: {
          currentVersion: '4.17.20',
          fixedVersions: ['4.17.21'],
          recommendedVersion: '4.17.21'
        },
        availableActions: ['VIEW_DETAILS', 'ASSIGN', 'CREATE_REMEDIATION']
      };

      const finding = adaptFinding(backendFinding, 'package.json');
      assert.ok(finding);
      assert.equal(finding.id, 'find_999');
      assert.equal(finding.cve_id, 'CVE-2021-23337');
      assert.equal(finding.severity, 'high');
      assert.equal(finding.status, 'open');
      assert.equal(finding.component_name, 'lodash');
      assert.equal(finding.component_version, '4.17.20');
      assert.equal(finding.fixed_version, '4.17.21');
      assert.equal(finding.dependency_scope, 'production');
      assert.ok(finding.risk_score > 0);
      assert.equal(finding.risk_band, 'high');
      assert.equal(finding.fingerprint, 'npm:lodash:4.17.20:CVE-2021-23337');
    });
  });
});
