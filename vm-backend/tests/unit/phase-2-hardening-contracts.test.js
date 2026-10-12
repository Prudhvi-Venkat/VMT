'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Repositories & Container
const { createContainer } = require('../../src/container');
const MongoScanFindingRepository = require('../../src/infrastructure/repositories/mongodb-scan-finding.repository');
const MongoScanRepository = require('../../src/infrastructure/repositories/mongodb-scan.repository');
const MongoUserRepository = require('../../src/infrastructure/repositories/mongodb-user.repository');
const MongoSessionRepository = require('../../src/infrastructure/repositories/mongodb-session.repository');
const MongoAuditRepository = require('../../src/infrastructure/repositories/mongodb-audit.repository');
const MongoScanComponentRepository = require('../../src/infrastructure/repositories/mongodb-scan-component.repository');
const MongoVulnerabilityIntelligenceRepository = require('../../src/infrastructure/repositories/mongodb-vulnerability-intelligence.repository');
const MemoryScanFindingRepository = require('../../src/infrastructure/repositories/memory-scan-finding.repository');
const MemoryScanComponentRepository = require('../../src/infrastructure/repositories/memory-scan-component.repository');
const MemoryScanRepository = require('../../src/infrastructure/repositories/memory-scan.repository');
const { ScanFinding } = require('../../src/domain/entities/scan-finding.entity');
const { ScanComponent } = require('../../src/domain/entities/scan-component.entity');
const { Scan } = require('../../src/domain/entities/scan.entity');
const { ScanFindingRepository } = require('../../src/domain/interfaces/scan-repository.interface');
const VulnerabilityIntelligenceRepository = require('../../src/domain/interfaces/vulnerability-intelligence.interface');

// Validators
const DashboardValidator = require('../../src/api/validators/dashboard.validator');
const IntegrationValidator = require('../../src/api/validators/integration.validator');
const AssetValidator = require('../../src/api/validators/asset.validator');
const FindingValidator = require('../../src/api/validators/finding.validator');
const TenantValidator = require('../../src/api/validators/tenant.validator');
const AuthValidator = require('../../src/api/validators/auth.validator');

describe('Phase 2: Hardening & Contracts Unit Tests', () => {

  describe('DATA-017: Container isMongo Repository Wiring', () => {
    it('should wire Mongo repositories when isMongo: true is specified', () => {
      const container = createContainer({ isMongo: true });
      assert.ok(container.scanFindingRepository instanceof MongoScanFindingRepository);
      assert.ok(container.scanRepository instanceof MongoScanRepository);
      assert.ok(container.userRepository instanceof MongoUserRepository);
      assert.ok(container.sessionRepository instanceof MongoSessionRepository);
      assert.ok(container.auditRepository instanceof MongoAuditRepository);
      assert.ok(container.scanComponentRepository instanceof MongoScanComponentRepository);
      assert.ok(container.vulnerabilityIntelligenceRepository instanceof MongoVulnerabilityIntelligenceRepository);
    });

    it('should default to Memory repositories when isMongo is false/unspecified', () => {
      const container = createContainer({ isMongo: false });
      assert.ok(container.scanFindingRepository instanceof MemoryScanFindingRepository);
      assert.ok(container.scanRepository instanceof MemoryScanRepository);
    });
  });

  describe('T9 (BE-06, HYG-001): Joi Validator Mounts & Normalization', () => {
    it('DashboardValidator: normalizes and synchronizes range and timeRange', () => {
      const req = { query: { timeRange: '7d' } };
      const res = {};
      let called = false;
      DashboardValidator.validateDashboardQuery(req, res, () => { called = true; });
      assert.ok(called);
      assert.equal(req.query.timeRange, '7d');
      assert.equal(req.query.range, '7d');
    });

    it('DashboardValidator: defaults to 30d when neither is provided', () => {
      const req = { query: {} };
      let called = false;
      DashboardValidator.validateDashboardQuery(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.query.range, '30d');
      assert.equal(req.query.timeRange, '30d');
    });

    it('IntegrationValidator: accepts type and name, normalizes to provider and displayName', () => {
      const req = {
        body: {
          type: 'github',
          name: 'My GitHub Repo',
          credentials: { token: 'ghp_secret' },
          config: { org: 'my-org' }
        }
      };
      let called = false;
      IntegrationValidator.validateCreateIntegration(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.type, 'GITHUB');
      assert.equal(req.body.provider, 'GITHUB');
      assert.equal(req.body.name, 'My GitHub Repo');
      assert.equal(req.body.displayName, 'My GitHub Repo');
    });

    it('AssetValidator: accepts flexible asset type, string owner, and array tags', () => {
      const req = {
        body: {
          name: 'Core Payment Cluster',
          type: 'KUBERNETES_CLUSTER',
          criticality: 'CRITICAL',
          environment: 'PRODUCTION',
          exposure: 'INTERNET_FACING',
          owner: 'secops-team',
          tags: ['pci-dss', 'tier-1']
        }
      };
      let called = false;
      AssetValidator.validateCreateAsset(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.name, 'Core Payment Cluster');
      assert.equal(req.body.type, 'KUBERNETES_CLUSTER');
    });

    it('FindingValidator: validates and normalizes status lifecycle updates', () => {
      const req = { body: { status: 'CLOSED' } };
      let called = false;
      FindingValidator.validateUpdateStatus(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.status, 'RESOLVED');
    });

    it('FindingValidator: validates assignFinding payload', () => {
      const req = { body: { assignedTo: 'usr_sec_analyst' } };
      let called = false;
      FindingValidator.validateAssignFinding(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.assignedTo, 'usr_sec_analyst');
    });
  });

  describe('T7, T8, T20 (RBAC-004, BE-03, BE-05): Tenant Validator Lifecycle Methods', () => {
    it('TenantValidator: validates user status update', () => {
      const req = { body: { status: 'disabled' } };
      let called = false;
      TenantValidator.validateUpdateUserStatus(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.status, 'DISABLED');
    });

    it('TenantValidator: validates project status update', () => {
      const req = { body: { status: 'archived' } };
      let called = false;
      TenantValidator.validateUpdateProjectStatus(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.status, 'ARCHIVED');
    });

    it('TenantValidator: validates project member assignment', () => {
      const req = { body: { userId: 'usr_dev_1', role: 'member' } };
      let called = false;
      TenantValidator.validateAssignProjectMember(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.role, 'MEMBER');
    });
  });

  describe('T17 (SEC-006, BE-11): Self-Registration Safeguards', () => {
    it('AuthValidator.validateTenantRegistration: rejects weak password failing complexity', () => {
      let status = null;
      let jsonBody = null;
      const res = {
        status(s) { status = s; return this; },
        json(b) { jsonBody = b; return this; }
      };
      const req = {
        body: {
          tenantKey: 'acme-corp',
          name: 'Acme Corp',
          superAdminEmail: 'admin@acme.com',
          superAdminPassword: 'weakpassword' // >= 8 chars, but lacks uppercase, digit, special char
        }
      };
      AuthValidator.validateTenantRegistration(req, res, () => {});
      assert.equal(status, 400);
      assert.equal(jsonBody.error.code, 'PASSWORD_COMPLEXITY_ERROR');
    });

    it('AuthValidator.validateTenantRegistration: accepts valid payload with strong password', () => {
      const req = {
        body: {
          tenantName: 'Acme Corp',
          tenantKey: 'acme-corp',
          adminEmail: 'admin@acme.com',
          adminPassword: 'Password123!'
        }
      };
      let called = false;
      AuthValidator.validateTenantRegistration(req, {}, () => { called = true; });
      assert.ok(called);
      assert.equal(req.body.tenantKey, 'acme-corp');
      assert.equal(req.body.name, 'Acme Corp');
      assert.equal(req.body.superAdminEmail, 'admin@acme.com');
      assert.equal(req.body.superAdminPassword, 'Password123!');
    });
  });

  describe('T10 (DATA-009, DATA-010): Memory & Mongo Parity Hardening', () => {
    it('MemoryScanFindingRepository: records history and returns it in getFindingById', async () => {
      const repo = new MemoryScanFindingRepository();
      const finding = new ScanFinding({
        id: 'f_test_01',
        tenantId: 'tenant_parity',
        scanId: 'scan_01',
        componentId: 'comp_01',
        vulnerabilityId: 'CVE-2026-9999',
        cveId: 'CVE-2026-9999',
        status: 'OPEN'
      });
      await repo.saveMany('tenant_parity', 'scan_01', [finding]);

      // Update status
      await repo.updateStatus('tenant_parity', 'f_test_01', {
        status: 'IN_PROGRESS',
        reason: 'Investigating',
        changedBy: 'usr_sec'
      });

      // Assign finding
      await repo.assignFinding('tenant_parity', 'f_test_01', {
        assignedTo: 'usr_dev',
        assignedUserName: 'Dev Engineer'
      });

      const result = await repo.getFindingById('tenant_parity', 'f_test_01');
      assert.ok(result);
      assert.equal(result.finding.status, 'IN_PROGRESS');
      assert.equal(result.finding.assignedTo, 'usr_dev');
      assert.equal(result.history.length, 2);
      assert.equal(result.history[0].newStatus, 'IN_PROGRESS');
      assert.equal(result.history[1].action, 'ASSIGNMENT');
    });

    it('MemoryScanFindingRepository: supports filtering by vulnerability, kev, dateFrom, dateTo', async () => {
      const repo = new MemoryScanFindingRepository();
      const f1 = new ScanFinding({
        id: 'f_kev',
        tenantId: 'tenant_filters',
        scanId: 'scan_01',
        componentId: 'comp_01',
        vulnerabilityId: 'CVE-2026-1111',
        cveId: 'CVE-2026-1111',
        status: 'OPEN',
        vulnerabilitySnapshot: { cisaKev: true, severity: 'CRITICAL', cvssScore: 9.8 },
        createdAt: new Date('2026-01-10')
      });
      const f2 = new ScanFinding({
        id: 'f_non_kev',
        tenantId: 'tenant_filters',
        scanId: 'scan_01',
        componentId: 'comp_02',
        vulnerabilityId: 'CVE-2026-2222',
        cveId: 'CVE-2026-2222',
        status: 'OPEN',
        vulnerabilitySnapshot: { cisaKev: false, severity: 'MEDIUM', cvssScore: 5.0 },
        createdAt: new Date('2026-02-10')
      });
      await repo.saveMany('tenant_filters', 'scan_01', [f1, f2]);

      const kevOnly = await repo.findByTenant('tenant_filters', { kev: true });
      assert.equal(kevOnly.total, 1);
      assert.equal(kevOnly.items[0].id, 'f_kev');

      const dateFiltered = await repo.findByTenant('tenant_filters', { dateFrom: '2026-02-01' });
      assert.equal(dateFiltered.total, 1);
      assert.equal(dateFiltered.items[0].id, 'f_non_kev');
    });

    it('MemoryScanComponentRepository: deduplicates components on saveMany', async () => {
      const repo = new MemoryScanComponentRepository();
      const comp1 = new ScanComponent({ id: 'comp_01', tenantId: 'tenant_comp', scanId: 'scan_comp', name: 'lodash', version: '4.17.21', ecosystem: 'npm' });
      const comp2 = new ScanComponent({ id: 'comp_01', tenantId: 'tenant_comp', scanId: 'scan_comp', name: 'lodash', version: '4.17.21', ecosystem: 'npm' });

      await repo.saveMany('tenant_comp', 'scan_comp', [comp1]);
      await repo.saveMany('tenant_comp', 'scan_comp', [comp2]);

      const list = await repo.findByScanId('tenant_comp', 'scan_comp');
      assert.equal(list.total, 1);
    });

    it('MemoryScanRepository: filters by projectId in findByTenant', async () => {
      const repo = new MemoryScanRepository();
      const s1 = new Scan({ id: 's_p1', tenantId: 't_proj', projectId: 'proj_alpha', originalFileName: 'package.json' });
      const s2 = new Scan({ id: 's_p2', tenantId: 't_proj', projectId: 'proj_beta', originalFileName: 'pom.xml' });

      await repo.save(s1);
      await repo.save(s2);

      const res = await repo.findByTenant('t_proj', { projectId: 'proj_alpha' });
      assert.equal(res.total, 1);
      assert.equal(res.items[0].id, 's_p1');
    });

    it('Interface contracts: ScanFindingRepository & VulnerabilityIntelligenceRepository declare required methods', () => {
      const findingMethods = Object.getOwnPropertyNames(ScanFindingRepository.prototype);
      assert.ok(findingMethods.includes('findByTenant'));
      assert.ok(findingMethods.includes('getFindingById'));
      assert.ok(findingMethods.includes('updateStatus'));
      assert.ok(findingMethods.includes('assignFinding'));

      const intelMethods = Object.getOwnPropertyNames(VulnerabilityIntelligenceRepository.prototype);
      assert.ok(intelMethods.includes('getVulnerabilityById'));
      assert.ok(intelMethods.includes('getAffectedComponents'));
      assert.ok(intelMethods.includes('getHistory'));
    });
  });

});
