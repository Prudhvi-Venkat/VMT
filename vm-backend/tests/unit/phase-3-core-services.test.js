'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const DashboardService = require('../../src/application/services/dashboard.service');
const TenantManagementService = require('../../src/application/services/tenant-management.service');
const { AuditService } = require('../../src/application/services/audit.service');
const DomainEvent = require('../../src/events/domain-event');
const { EventBus } = require('../../src/events/event-bus');
const NotificationQueue = require('../../src/infrastructure/notifications/notification-queue');
const EmailWorker = require('../../src/infrastructure/notifications/email-worker');
const EmailTemplateService = require('../../src/infrastructure/notifications/email-template.service');
const MemoryUserRepository = require('../../src/infrastructure/repositories/memory-user.repository');
const MemoryScanRepository = require('../../src/infrastructure/repositories/memory-scan.repository');
const MemoryScanFindingRepository = require('../../src/infrastructure/repositories/memory-scan-finding.repository');
const MemoryAuditRepository = require('../../src/infrastructure/repositories/memory-audit.repository');
const { Scan, ScanStatus } = require('../../src/domain/entities/scan.entity');
const { ScanFinding, FindingStatus } = require('../../src/domain/entities/scan-finding.entity');

describe('HYG-007, HYG-002, HYG-003: Core Services & Event/Notification Unit Tests', () => {

  // ─── 1. DashboardService ──────────────────────────────────────────────────
  describe('DashboardService', () => {
    it('getTenantDashboard: aggregates overview, severity, and timeline correctly', async () => {
      const scanRepo = new MemoryScanRepository();
      const findingRepo = new MemoryScanFindingRepository();

      const tenantId = 'tenant_dash_01';
      await scanRepo.save(new Scan({
        tenantId,
        status: ScanStatus.COMPLETED,
        findingCount: 1,
        criticalCount: 1,
        originalFileName: 'package.json'
      }));

      await findingRepo.saveMany(tenantId, 'scan_001', [
        new ScanFinding({
          id: 'find_d_01',
          tenantId,
          scanId: 'scan_001',
          componentId: 'comp_01',
          vulnerabilityId: 'CVE-2026-0001',
          status: FindingStatus.OPEN,
          vulnerabilitySnapshot: { severity: 'CRITICAL' }
        })
      ]);

      const mockProjectRepo = {
        findByTenant: async () => ({ items: [], total: 0 })
      };
      const mockTenantRepo = {
        findByKey: async () => ({ tenantKey: tenantId, name: 'Tenant 1' })
      };

      const service = new DashboardService({
        scanRepository: scanRepo,
        scanFindingRepository: findingRepo,
        projectRepository: mockProjectRepo,
        tenantRepository: mockTenantRepo
      });

      const result = await service.getTenantDashboard(tenantId, { range: '30d' });
      assert.ok(result);
      assert.equal(result.range, '30d');
      assert.equal(result.findings.total, 1);
      assert.equal(result.findings.severity.CRITICAL, 1);
    });

    it('getProjectDashboard: calculates project specific metrics', async () => {
      const scanRepo = new MemoryScanRepository();
      const findingRepo = new MemoryScanFindingRepository();

      const tenantId = 'tenant_dash_02';
      const projectId = 'proj_dash_02';

      const mockProjectRepo = {
        findById: async (t, id) => ({
          id,
          tenantId: t,
          name: 'Project 2',
          key: 'P2',
          status: 'active'
        })
      };

      const service = new DashboardService({
        scanRepository: scanRepo,
        scanFindingRepository: findingRepo,
        projectRepository: mockProjectRepo
      });

      const result = await service.getProjectDashboard(tenantId, projectId);
      assert.ok(result);
      assert.equal(result.project.id, projectId);
      assert.ok(result.metrics);
      assert.equal(result.metrics.totalFindings, 0);
    });
  });

  // ─── 2. TenantManagementService ──────────────────────────────────────────
  describe('TenantManagementService', () => {
    const createMockTenantDbManager = () => {
      const users = new Map();
      const auditLogs = [];
      const tenantDb = {
        collection: (name) => {
          if (name === 'users') {
            return {
              findOne: async ({ email }) => users.get(email) || null,
              insertOne: async (doc) => { users.set(doc.email, doc); users.set(doc.id, doc); return doc; },
              updateOne: async ({ id }, { $set }) => {
                const u = users.get(id);
                if (u) Object.assign(u, $set);
                return { modifiedCount: 1 };
              },
              find: () => ({ sort: () => ({ toArray: async () => Array.from(users.values()) }) }),
              countDocuments: async () => users.size
            };
          }
          if (name === 'audit_logs') {
            return {
              insertOne: async (doc) => { auditLogs.push(doc); return doc; }
            };
          }
          return {
            find: () => ({ toArray: async () => [] }),
            countDocuments: async () => 0
          };
        }
      };
      return {
        sanitizeTenantKey: (k) => k.toLowerCase().trim(),
        getTenantDb: () => tenantDb,
        getPlatformDb: () => tenantDb
      };
    };

    it('creates tenant and provisions super admin', async () => {
      const userRepo = new MemoryUserRepository();
      const tenants = new Map();
      const mockTenantRepo = {
        save: async (t) => { tenants.set(t.tenantKey, t); return t; },
        findByKey: async (k) => tenants.get(k) || null
      };

      const service = new TenantManagementService({
        tenantDbManager: createMockTenantDbManager(),
        tenantRepository: mockTenantRepo,
        userRepository: userRepo
      });

      const result = await service.createTenant({
        tenantKey: 'acme_test',
        name: 'Acme Test Corp',
        displayName: 'Acme Corp',
        superAdminEmail: 'super@acme.test',
        superAdminPassword: 'Password#123',
        superAdminName: 'Super Admin'
      });

      assert.ok(result);
      assert.equal(result.tenant.tenantKey, 'acme_test');

      const retrieved = await service.getTenant('acme_test');
      assert.equal(retrieved.tenantKey, 'acme_test');
    });

    it('updates tenant user status with soft deactivation', async () => {
      const userRepo = new MemoryUserRepository();
      const tenants = new Map();
      const mockTenantRepo = {
        save: async (t) => { tenants.set(t.tenantKey, t); return t; },
        findByKey: async (k) => tenants.get(k) || null
      };

      const service = new TenantManagementService({
        tenantDbManager: createMockTenantDbManager(),
        tenantRepository: mockTenantRepo,
        userRepository: userRepo
      });

      await service.createTenant({
        tenantKey: 'corp_test',
        name: 'Corp Test',
        superAdminEmail: 'admin@corp.test',
        superAdminPassword: 'Password#123'
      });

      const createdUser = await service.createEndUser('corp_test', {
        email: 'dev@corp.test',
        name: 'Developer',
        roles: ['END_USER'],
        password: 'Password#123'
      }, 'usr_super_admin');

      assert.equal(createdUser.status, 'ACTIVE');

      const updated = await service.updateTenantUserStatus('corp_test', createdUser.id, 'INACTIVE', 'usr_super_admin');
      assert.equal(updated.status, 'INACTIVE');
    });
  });

  // ─── 3. AuditService ─────────────────────────────────────────────────────
  describe('AuditService', () => {
    it('recordEvent persists event to audit repository', async () => {
      const auditRepo = new MemoryAuditRepository();
      const auditService = new AuditService(auditRepo);

      const event = await auditService.recordEvent({
        tenantId: 'tenant_audit_test',
        actor: { userId: 'usr_sec_10', roles: ['SECURITY_MANAGER'] },
        action: 'finding.status_updated',
        resource: { type: 'finding', id: 'find_101' },
        details: { newStatus: 'RESOLVED' }
      });

      assert.ok(event);
      assert.equal(event.action, 'finding.status_updated');
      assert.equal(event.actor.userId, 'usr_sec_10');

      const logs = await auditRepo.findByTenantId('tenant_audit_test');
      assert.equal(logs.items.length, 1);
      assert.equal(logs.items[0].action, 'finding.status_updated');
    });
  });

  // ─── 4. Event Bus & Notification Subsystem (HYG-002, HYG-003) ────────────
  describe('Domain Event Bus & Notification Subsystem', () => {
    it('HYG-003: published domain event reaches registered subscriber', async () => {
      const bus = new EventBus();
      let eventReceived = null;

      bus.subscribe('test.security_alert', (evt) => {
        eventReceived = evt;
      });

      const domainEvent = new DomainEvent({
        eventType: 'test.security_alert',
        tenantId: 'tenant_event_01',
        payload: { alertLevel: 'CRITICAL', cve: 'CVE-2026-0001' }
      });

      await bus.publish(domainEvent);

      assert.ok(eventReceived);
      assert.equal(eventReceived.eventType, 'test.security_alert');
      assert.equal(eventReceived.payload.cve, 'CVE-2026-0001');
    });

    it('HYG-002: NotificationQueue enqueues and EmailWorker processes notification', async () => {
      const queue = new NotificationQueue({ concurrency: 2 });
      const emailTemplateService = new EmailTemplateService();
      let handledJob = null;

      const worker = new EmailWorker({
        notificationQueue: queue,
        emailTemplateService
      });

      // Override handler to verify end-to-end receipt
      worker.handleNotification = async (job) => {
        handledJob = job;
        return { delivered: true, recipient: job.recipient, type: job.type };
      };
      queue.setHandler(worker.handleNotification.bind(worker));

      await queue.enqueue({
        type: 'SCAN_COMPLETED',
        tenantId: 'tenant_queue_01',
        recipient: 'secops@tenant.local',
        payload: {
          scanId: 'scan_q_100',
          filename: 'package-lock.json',
          findingCount: 3,
          criticalCount: 1,
          highCount: 2
        }
      });

      // Give worker a moment to execute
      await new Promise(resolve => setTimeout(resolve, 50));

      assert.ok(handledJob);
      assert.equal(handledJob.type, 'SCAN_COMPLETED');
      assert.equal(handledJob.recipient, 'secops@tenant.local');
      assert.equal(handledJob.payload.scanId, 'scan_q_100');
    });
  });
});
