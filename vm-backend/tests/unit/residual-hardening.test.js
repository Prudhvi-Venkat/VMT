'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const createAuthenticateMiddleware = require('../../src/middleware/authenticate.middleware');
const AuthService = require('../../src/application/services/auth.service');
const EmailTemplateService = require('../../src/infrastructure/notifications/email-template.service');
const VulnerabilityScannerController = require('../../src/api/controllers/vulnerability-scanner.controller');
const DashboardService = require('../../src/application/services/dashboard.service');
const ScmIntegrationService = require('../../src/infrastructure/integrations/scm-integration.service');
const JwtService = require('../../src/infrastructure/security/jwt.service');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');
const { Session, SessionStatus } = require('../../src/domain/entities/session.entity');
const { ScanFinding, FindingStatus } = require('../../src/domain/entities/scan-finding.entity');
const { SLA_DAYS_BY_SEVERITY } = require('../../src/domain/policies/finding-lifecycle-policy');

describe('Hardening & Residual Remediation Suite', () => {

  // =========================================================================
  // SEC-009: Tenant Active Status Verification
  // =========================================================================
  describe('SEC-009: Tenant Status Verification at Auth Time', () => {
    it('authenticate middleware returns 403 TENANT_INACTIVE when tenant is SUSPENDED', async () => {
      const mockSession = new Session({
        id: 'sess_sec009_1',
        userId: 'usr_sec009_1',
        status: SessionStatus.ACTIVE,
        expiresAt: new Date(Date.now() + 3600000)
      });
      const mockUser = new User({
        id: 'usr_sec009_1',
        email: 'user@suspended.test',
        roles: ['END_USER'],
        scope: 'tenant',
        tenantId: 'suspended_tenant',
        status: UserStatus.ACTIVE
      });
      const mockSessionRepo = { findById: async () => mockSession };
      const mockUserRepo = { findById: async () => mockUser };
      const mockTenantRepo = {
        findByKey: async (key) => ({
          tenantKey: key,
          status: 'SUSPENDED'
        })
      };

      const middleware = createAuthenticateMiddleware({
        sessionRepository: mockSessionRepo,
        userRepository: mockUserRepo,
        tenantRepository: mockTenantRepo
      });

      const { token } = JwtService.signAccessToken({
        userId: mockUser.id,
        sessionId: mockSession.id,
        scope: 'tenant',
        tenantId: 'suspended_tenant',
        roles: ['END_USER']
      });

      let statusCode = 0;
      let jsonPayload = null;
      const req = {
        id: 'req_sec009_1',
        headers: { authorization: `Bearer ${token}` }
      };
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          jsonPayload = data;
          return this;
        }
      };

      await middleware(req, res, () => {
        assert.fail('Should not call next when tenant is SUSPENDED');
      });

      assert.equal(statusCode, 403);
      assert.equal(jsonPayload?.error?.code, 'TENANT_INACTIVE');
    });

    it('AuthService.login rejects with 403 TENANT_INACTIVE when tenant is DISABLED', async () => {
      const password = 'CorrectPassword123!';
      const user = new User({
        id: 'usr_sec009_2',
        email: 'admin@disabled.test',
        passwordHash: PasswordPolicy.hash(password),
        roles: ['TENANT_ADMIN'],
        scope: 'tenant',
        tenantId: 'disabled_tenant',
        status: UserStatus.ACTIVE
      });
      const userRepo = {
        findByEmail: async () => user,
        findById: async () => user,
        save: async () => user
      };
      const sessionRepo = { save: async () => {} };
      const auditService = { recordEvent: async () => {} };
      const tenantRepo = {
        findByKey: async () => ({ tenantKey: 'disabled_tenant', status: 'DISABLED' })
      };

      const authService = new AuthService({
        userRepository: userRepo,
        sessionRepository: sessionRepo,
        auditService,
        tenantRepository: tenantRepo
      });

      await assert.rejects(
        () => authService.login({ email: 'admin@disabled.test', password, tenantKey: 'disabled_tenant' }),
        (err) => {
          assert.equal(err.code, 'TENANT_INACTIVE');
          assert.equal(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  // =========================================================================
  // SEC-011: HTML Escaping in Email Notifications
  // =========================================================================
  describe('SEC-011: Email Notification HTML Sanitization', () => {
    it('escapeHtml safely neutralizes HTML and script tags', () => {
      const dirty = '<script>alert("XSS")</script>&<foo>\'bar\'';
      const clean = EmailTemplateService.escapeHtml(dirty);
      assert.ok(!clean.includes('<script>'));
      assert.ok(!clean.includes('</script>'));
      assert.ok(clean.includes('&lt;script&gt;'));
      assert.ok(clean.includes('&amp;'));
      assert.ok(clean.includes('&#39;bar&#39;'));
    });

    it('renderUserOnboarding escapes malicious injected tenant and user names', () => {
      const service = new EmailTemplateService();
      const result = service.renderUserOnboarding({
        name: '<img src=x onerror=alert(1)>',
        email: 'victim@test.org',
        tenantName: '<b>MaliciousTenant</b>',
        temporaryPassword: 'TempPassword123!',
        loginUrl: 'https://app.security.test/login'
      });

      assert.ok(!result.html.includes('<img src=x onerror=alert(1)>'));
      assert.ok(!result.html.includes('<b>MaliciousTenant</b>'));
      assert.ok(result.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
      assert.ok(result.html.includes('&lt;b&gt;MaliciousTenant&lt;/b&gt;'));
    });
  });

  // =========================================================================
  // SEC-008: 25MB Upload Stream Cap
  // =========================================================================
  describe('SEC-008: Scanner Stream Body Cap (25MB)', () => {
    it('rejects oversized JSON payload with HTTP 413 PAYLOAD_TOO_LARGE', async () => {
      const controller = new VulnerabilityScannerController({});
      // Simulate payload string greater than 25MB
      const bigBuffer = Buffer.alloc(26 * 1024 * 1024, 65); // 26MB of 'A'
      const req = {
        principal: { tenantId: 'tenant_test', isPlatformScope: () => false },
        headers: { 'content-type': 'application/json' },
        body: {
          filename: 'large.json',
          content: bigBuffer.toString('utf8')
        }
      };
      let statusCode = null;
      let errorPayload = null;
      const res = {
        status(code) {
          statusCode = code;
          return this;
        },
        json(data) {
          errorPayload = data;
          return this;
        }
      };

      try {
        await controller.uploadScan(req, res, (err) => {
          if (err) throw err;
        });
        assert.fail('Expected 413 error');
      } catch (err) {
        assert.equal(err.statusCode, 413);
        assert.equal(err.code, 'PAYLOAD_TOO_LARGE');
      }
    });
  });

  // =========================================================================
  // DATA-012: SLA Calculation Alignment with FindingLifecyclePolicy
  // =========================================================================
  describe('DATA-012: Dashboard SLA Calculation Alignment', () => {
    it('getTenantDashboard breaches CRITICAL findings after 7 days and HIGH after 14 days', async () => {
      const now = Date.now();
      const MS_PER_DAY = 86400000;

      // 8 days old Critical -> Breached (> 7d)
      const criticalFinding = new ScanFinding({
        id: 'find_crit_sla',
        tenantId: 'tenant_sla',
        scanId: 'scan_1',
        componentId: 'comp_1',
        vulnerabilityId: 'CVE-2026-9999',
        status: FindingStatus.OPEN,
        vulnerabilitySnapshot: { severity: 'CRITICAL' },
        createdAt: new Date(now - 8 * MS_PER_DAY)
      });

      // 10 days old High -> Within SLA (<= 14d)
      const highFinding = new ScanFinding({
        id: 'find_high_sla',
        tenantId: 'tenant_sla',
        scanId: 'scan_1',
        componentId: 'comp_2',
        vulnerabilityId: 'CVE-2026-8888',
        status: FindingStatus.OPEN,
        vulnerabilitySnapshot: { severity: 'HIGH' },
        createdAt: new Date(now - 10 * MS_PER_DAY)
      });

      const scanFindingRepo = {
        findByTenant: async () => ({
          items: [criticalFinding, highFinding],
          total: 2
        })
      };
      const scanRepo = {
        findByTenant: async () => ({ items: [], total: 0 })
      };
      const projectRepo = {
        findByTenant: async () => ({ items: [], total: 0 })
      };
      const tenantRepo = {
        findByKey: async () => ({ tenantKey: 'tenant_sla', name: 'SLA Test' })
      };

      const dashboardService = new DashboardService({
        scanFindingRepository: scanFindingRepo,
        scanRepository: scanRepo,
        projectRepository: projectRepo,
        tenantRepository: tenantRepo
      });

      const result = await dashboardService.getTenantDashboard('tenant_sla', { range: '30d' });
      assert.equal(result.findings.sla.breachedSla, 1, 'Critical finding at 8 days should breach 7d SLA');
      assert.equal(result.findings.sla.withinSla, 1, 'High finding at 10 days should be within 14d SLA');
    });
  });

  // =========================================================================
  // SEC-007: Outbound URL & Traversal Sanitization
  // =========================================================================
  describe('SEC-007: Outbound URL SSRF Guard & Manifest Path Traversal', () => {
    it('_validateOutboundUrl rejects non-HTTPS protocols and private IP ranges', () => {
      const scmService = new ScmIntegrationService({ tenantDbManager: {} });

      assert.throws(
        () => scmService._validateOutboundUrl('http://api.github.com'),
        (err) => err.statusCode === 400 && err.message.includes('https')
      );

      assert.throws(
        () => scmService._validateOutboundUrl('https://localhost:8080'),
        (err) => err.statusCode === 400 && err.message.includes('private or loopback')
      );

      assert.throws(
        () => scmService._validateOutboundUrl('https://169.254.169.254/latest/meta-data'),
        (err) => err.statusCode === 400 && err.message.includes('private or loopback')
      );

      assert.throws(
        () => scmService._validateOutboundUrl('https://10.0.1.5:443'),
        (err) => err.statusCode === 400 && err.message.includes('private or loopback')
      );

      // Valid public https URL should pass
      const origin = scmService._validateOutboundUrl('https://api.github.enterprise.com/api/v3');
      assert.equal(origin, 'https://api.github.enterprise.com');
    });

    it('triggerRepositoryScan rejects directory traversal sequences in manifestPath', async () => {
      const scmService = new ScmIntegrationService({ tenantDbManager: {} });

      await assert.rejects(
        () => scmService.triggerRepositoryScan('tenant_test', {
          integrationId: 'integ_1',
          repositoryId: '123',
          manifestPath: '../../etc/passwd'
        }, 'usr_1'),
        (err) => err.statusCode === 400 && err.message.includes('path traversal')
      );

      await assert.rejects(
        () => scmService.triggerRepositoryScan('tenant_test', {
          integrationId: 'integ_1',
          repositoryId: '123',
          manifestPath: '/absolute/path/manifest.json'
        }, 'usr_1'),
        (err) => err.statusCode === 400 && err.message.includes('path traversal')
      );
    });
  });

});
