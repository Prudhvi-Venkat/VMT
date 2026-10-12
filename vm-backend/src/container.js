'use strict';

// Repositories
const MemoryUserRepository = require('./infrastructure/repositories/memory-user.repository');
const MemorySessionRepository = require('./infrastructure/repositories/memory-session.repository');
const MemoryAuditRepository = require('./infrastructure/repositories/memory-audit.repository');
const MemoryScanRepository = require('./infrastructure/repositories/memory-scan.repository');
const MemoryScanComponentRepository = require('./infrastructure/repositories/memory-scan-component.repository');
const MemoryScanFindingRepository = require('./infrastructure/repositories/memory-scan-finding.repository');
const MemoryVulnerabilityIntelligenceRepository = require('./infrastructure/repositories/memory-vulnerability-intelligence.repository');
const MemoryAssetRepository = require('./infrastructure/repositories/memory-asset.repository');
const MemoryTenantRepository = require('./infrastructure/repositories/memory-tenant.repository');

const MongoUserRepository = require('./infrastructure/repositories/mongodb-user.repository');
const MongoSessionRepository = require('./infrastructure/repositories/mongodb-session.repository');
const MongoAuditRepository = require('./infrastructure/repositories/mongodb-audit.repository');
const MongoScanRepository = require('./infrastructure/repositories/mongodb-scan.repository');
const MongoScanComponentRepository = require('./infrastructure/repositories/mongodb-scan-component.repository');
const MongoScanFindingRepository = require('./infrastructure/repositories/mongodb-scan-finding.repository');
const MongoVulnerabilityIntelligenceRepository = require('./infrastructure/repositories/mongodb-vulnerability-intelligence.repository');
const MongoTenantRepository = require('./infrastructure/repositories/mongodb-tenant.repository');
const MongoProjectRepository = require('./infrastructure/repositories/mongodb-project.repository');
const MongoAssetRepository = require('./infrastructure/repositories/mongodb-asset.repository');
const { tenantDbManager } = require('./infrastructure/database/tenant-database-manager');

const logger = require('./observability/logger');

// Queue & Cache & Events
const InMemoryScanQueue = require('./infrastructure/queue/in-memory-scan-queue');
const { eventBus } = require('./events/event-bus');
const { cacheService } = require('./infrastructure/cache/redis-cache');
const NotificationQueue = require('./infrastructure/notifications/notification-queue');
const EmailTemplateService = require('./infrastructure/notifications/email-template.service');
const EmailWorker = require('./infrastructure/notifications/email-worker');

// Scanner Subsystem
const ParserRegistry = require('./infrastructure/scanners/parser-registry');
const ComponentResolutionService = require('./application/services/component-resolution.service');
const VersionMatchingService = require('./application/services/version-matching.service');
const VulnerabilityMatchingService = require('./application/services/vulnerability-matching.service');
const VulnerabilityEnrichmentService = require('./application/services/vulnerability-enrichment.service');
const VulnerabilityScannerService = require('./application/services/vulnerability-scanner.service');
const VulnerabilityScanWorker = require('./workers/vulnerability-scan.worker');
const SbomExportService = require('./application/services/sbom-export.service');

// Application Services
const AuthService = require('./application/services/auth.service');
const { AuditService } = require('./application/services/audit.service');
const TenantManagementService = require('./application/services/tenant-management.service');
const ScmIntegrationService = require('./infrastructure/integrations/scm-integration.service');
const DashboardService = require('./application/services/dashboard.service');
const VulnerabilityIntelligenceService = require('./application/services/vulnerability-intelligence.service');
const RiskEngineService = require('./application/services/risk-engine.service');
const AssetService = require('./application/services/asset.service');

// Controllers
const AuthController = require('./api/controllers/auth.controller');
const VulnerabilityScannerController = require('./api/controllers/vulnerability-scanner.controller');
const VulnerabilityIntelligenceController = require('./api/controllers/vulnerability-intelligence.controller');
const DashboardController = require('./api/controllers/dashboard.controller');
const AssetController = require('./api/controllers/asset.controller');

function createContainer(options = {}) {
  const isMongo = Boolean(options.isMongo ?? options.useMongo ?? false);

  // Repositories (support custom injected or defaults)
  const userRepository = options.userRepository || (isMongo ? new MongoUserRepository() : new MemoryUserRepository());
  const sessionRepository = options.sessionRepository || (isMongo ? new MongoSessionRepository() : new MemorySessionRepository());
  const auditRepository = options.auditRepository || (isMongo ? new MongoAuditRepository() : new MemoryAuditRepository());
  const scanRepository = options.scanRepository || (isMongo ? new MongoScanRepository() : new MemoryScanRepository());
  const scanComponentRepository = options.scanComponentRepository || (isMongo ? new MongoScanComponentRepository() : new MemoryScanComponentRepository());
  const scanFindingRepository = options.scanFindingRepository || (isMongo ? new MongoScanFindingRepository() : new MemoryScanFindingRepository());
  const vulnerabilityIntelligenceRepository = options.vulnerabilityIntelligenceRepository || (isMongo ? new MongoVulnerabilityIntelligenceRepository() : new MemoryVulnerabilityIntelligenceRepository());
  const tenantRepository = options.tenantRepository || (isMongo ? new MongoTenantRepository(tenantDbManager) : new MemoryTenantRepository());
  const projectRepository = options.projectRepository || new MongoProjectRepository(tenantDbManager);
  const assetRepository = options.assetRepository || (isMongo ? new MongoAssetRepository(tenantDbManager) : new MemoryAssetRepository());

  const scanQueue = options.scanQueue || new InMemoryScanQueue({ concurrency: 2 });
  const eventBusInstance = options.eventBus || eventBus;
  const cacheServiceInstance = options.cacheService || cacheService;

  // Domain & Application Services
  const auditService = new AuditService(auditRepository);
  const authService = new AuthService({
    userRepository,
    sessionRepository,
    auditService,
    tenantRepository
  });

  const parserRegistry = new ParserRegistry();
  const componentResolutionService = new ComponentResolutionService();
  const versionMatchingService = new VersionMatchingService();
  const vulnerabilityMatchingService = new VulnerabilityMatchingService({
    vulnerabilityIntelligenceRepository,
    versionMatchingService
  });
  const vulnerabilityEnrichmentService = new VulnerabilityEnrichmentService({
    vulnerabilityIntelligenceRepository
  });

  // Notifications (HYG-002)
  const notificationQueue = new NotificationQueue({ concurrency: 2 });
  const emailTemplateService = new EmailTemplateService();

  let emailTransporter = options.transporter || null;
  if (!emailTransporter && process.env.SMTP_HOST) {
    try {
      const nodemailer = require('nodemailer');
      emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '1025', 10),
        secure: process.env.SMTP_SECURE === 'true',
        ignoreTLS: process.env.SMTP_IGNORE_TLS !== 'false'
      });
    } catch {
      // If nodemailer is missing or fails to initialize, falls back to simulated transport
    }
  }

  const emailWorker = new EmailWorker({
    notificationQueue,
    emailTemplateService,
    transporter: emailTransporter
  });

  const scannerService = new VulnerabilityScannerService({
    scanRepository,
    scanComponentRepository,
    scanFindingRepository,
    parserRegistry,
    componentResolutionService,
    vulnerabilityMatchingService,
    vulnerabilityEnrichmentService,
    scanQueue,
    auditService,
    notificationQueue
  });

  const scannerWorker = new VulnerabilityScanWorker({
    scannerService,
    scanQueue
  });

  const sbomExportService = new SbomExportService({
    scanRepository,
    scanComponentRepository,
    scanFindingRepository
  });

  const vulnerabilityIntelligenceService = new VulnerabilityIntelligenceService({
    vulnerabilityIntelligenceRepository,
    scanFindingRepository,
    auditService
  });

  const tenantManagementService = new TenantManagementService({
    tenantDbManager,
    tenantRepository,
    projectRepository,
    userRepository
  });

  const scmIntegrationService = new ScmIntegrationService({
    tenantDbManager,
    scannerService,
    projectRepository
  });

  const dashboardService = new DashboardService({
    tenantDbManager,
    tenantRepository,
    projectRepository,
    scanRepository,
    scanFindingRepository
  });

  const riskEngineService = new RiskEngineService({
    tenantRepository,
    assetRepository,
    eventBusInstance
  });

  const assetService = new AssetService({
    assetRepository,
    auditService,
    eventBusInstance
  });

  // Wire domain event subscriptions to audit and notification queues (HYG-002, HYG-003)
  eventBusInstance.subscribe('finding.status_changed', async (event) => {
    logger.info('[EVENT] finding.status_changed', { eventId: event.id, tenantId: event.tenantId });
    if (event.payload?.findingId) {
      await notificationQueue.enqueue({
        type: 'finding.status_changed',
        tenantId: event.tenantId,
        recipient: event.payload.assignedTo || 'security-team@tenant.local',
        payload: event.payload
      });
    }
  });

  eventBusInstance.subscribe('asset.created', async (event) => {
    logger.info('[EVENT] asset.created', { eventId: event.id, tenantId: event.tenantId, assetId: event.payload?.assetId });
  });

  eventBusInstance.subscribe('asset.updated', async (event) => {
    logger.info('[EVENT] asset.updated', { eventId: event.id, tenantId: event.tenantId, assetId: event.payload?.assetId });
  });

  eventBusInstance.subscribe('asset.deleted', async (event) => {
    logger.info('[EVENT] asset.deleted', { eventId: event.id, tenantId: event.tenantId, assetId: event.payload?.assetId });
  });

  eventBusInstance.subscribe('risk.calculated', async (event) => {
    logger.info('[EVENT] risk.calculated', { eventId: event.id, tenantId: event.tenantId, findingId: event.payload?.findingId });
  });

  // Controllers
  const authController = new AuthController(authService);
  const scannerController = new VulnerabilityScannerController(scannerService, sbomExportService);
  const vulnerabilityIntelligenceController = new VulnerabilityIntelligenceController({ vulnerabilityIntelligenceService });
  const dashboardController = new DashboardController(dashboardService);
  const assetController = new AssetController(assetService);

  return {
    // Repositories
    userRepository,
    sessionRepository,
    auditRepository,
    scanRepository,
    scanComponentRepository,
    scanFindingRepository,
    vulnerabilityIntelligenceRepository,
    tenantRepository,
    projectRepository,
    assetRepository,
    scanQueue,
    eventBus: eventBusInstance,
    cacheService: cacheServiceInstance,

    // Services
    auditService,
    authService,
    scannerService,
    scannerWorker,
    sbomExportService,
    vulnerabilityIntelligenceService,
    tenantManagementService,
    scmIntegrationService,
    dashboardService,
    riskEngineService,
    assetService,
    notificationQueue,
    emailTemplateService,
    emailWorker,

    // Controllers
    authController,
    scannerController,
    vulnerabilityIntelligenceController,
    dashboardController,
    assetController
  };
}

module.exports = {
  createContainer
};
