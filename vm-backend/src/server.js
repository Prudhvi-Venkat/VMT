'use strict';

const config = require('./config');
const logger = require('./observability/logger');
const createApp = require('./app');
const { getMongoClient } = require('./infrastructure/database/mongodb');
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

const MemoryUserRepository = require('./infrastructure/repositories/memory-user.repository');
const MemorySessionRepository = require('./infrastructure/repositories/memory-session.repository');
const MemoryAuditRepository = require('./infrastructure/repositories/memory-audit.repository');
const MemoryScanRepository = require('./infrastructure/repositories/memory-scan.repository');
const MemoryScanComponentRepository = require('./infrastructure/repositories/memory-scan-component.repository');
const MemoryScanFindingRepository = require('./infrastructure/repositories/memory-scan-finding.repository');
const MemoryVulnerabilityIntelligenceRepository = require('./infrastructure/repositories/memory-vulnerability-intelligence.repository');
const MemoryAssetRepository = require('./infrastructure/repositories/memory-asset.repository');

const PasswordPolicy = require('./domain/policies/password-policy');
const { User, UserStatus } = require('./domain/entities/user.entity');
const { cacheService } = require('./infrastructure/cache/redis-cache');

function validateStartupConfig(cfg) {
  if (!cfg.jwt?.secret || typeof cfg.jwt.secret !== 'string' || cfg.jwt.secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing or shorter than 32 characters.');
  }
}

async function bootstrap() {
  validateStartupConfig(config);
  let userRepository;
  let sessionRepository;
  let auditRepository;
  let scanRepository;
  let scanComponentRepository;
  let scanFindingRepository;
  let vulnerabilityIntelligenceRepository;
  let tenantRepository;
  let projectRepository;
  let assetRepository;

  const mongoClient = await getMongoClient();
  if (mongoClient) {
    logger.info('Using MongoDB persistence layer');
    userRepository = new MongoUserRepository();
    sessionRepository = new MongoSessionRepository();
    auditRepository = new MongoAuditRepository();
    scanRepository = new MongoScanRepository();
    scanComponentRepository = new MongoScanComponentRepository();
    scanFindingRepository = new MongoScanFindingRepository();
    vulnerabilityIntelligenceRepository = new MongoVulnerabilityIntelligenceRepository(tenantDbManager.getIntelligenceDb());
    tenantRepository = new MongoTenantRepository(tenantDbManager);
    projectRepository = new MongoProjectRepository(tenantDbManager);
    assetRepository = new MongoAssetRepository(tenantDbManager);
  } else {
    logger.warn('MongoDB connection not active, defaulting to in-memory persistence layer');
    userRepository = new MemoryUserRepository();
    sessionRepository = new MemorySessionRepository();
    auditRepository = new MemoryAuditRepository();
    scanRepository = new MemoryScanRepository();
    scanComponentRepository = new MemoryScanComponentRepository();
    scanFindingRepository = new MemoryScanFindingRepository();
    vulnerabilityIntelligenceRepository = new MemoryVulnerabilityIntelligenceRepository();
    tenantRepository = new MongoTenantRepository(tenantDbManager);
    projectRepository = new MongoProjectRepository(tenantDbManager);
    assetRepository = new MemoryAssetRepository();
  }

  // Seed default accounts and demo tenant only in non-production environments (SEC-003, SEC-015)
  if (process.env.NODE_ENV === 'production') {
    logger.info('Production environment detected: automated account and tenant seeding disabled');
  } else {
    // Seed default Platform Admin if no users exist (for local development/testing)
    const existingAdmin = await userRepository.findByEmail('admin@platform.local');
    const platformAdminPassword = process.env.PLATFORM_ADMIN_BOOTSTRAP_PASSWORD;
    if (!existingAdmin && platformAdminPassword) {
      const adminUser = new User({
        id: 'usr_platform_admin_001',
        email: 'admin@platform.local',
        passwordHash: PasswordPolicy.hash(platformAdminPassword),
        status: UserStatus.ACTIVE,
        roles: ['PLATFORM_ADMIN'],
        scope: 'platform'
      });
      await userRepository.save(adminUser);
      logger.info('Seeded default Platform Admin account', { email: adminUser.email });
    } else if (!existingAdmin) {
      logger.info('Platform Admin bootstrap skipped; set PLATFORM_ADMIN_BOOTSTRAP_PASSWORD to provision an initial account');
    }

    // Seed initial demo tenant "acme-security" if MongoDB is active
    if (mongoClient) {
      try {
        const tenantBootstrapPassword = process.env.TENANT_SUPER_ADMIN_BOOTSTRAP_PASSWORD;
        const endUserBootstrapPassword = process.env.END_USER_BOOTSTRAP_PASSWORD;
        if (!tenantBootstrapPassword || !endUserBootstrapPassword) {
          logger.info('Demo tenant bootstrap skipped; explicit tenant bootstrap passwords are required');
        } else {
          const TenantManagementService = require('./application/services/tenant-management.service');
          const tenantService = new TenantManagementService({
            tenantDbManager,
            tenantRepository,
            projectRepository
          });

          const existingTenant = await tenantRepository.findByKey('acme-security');
          if (!existingTenant) {
            await tenantService.createTenant({
              tenantKey: 'acme-security',
              name: 'Acme Security Corp',
              displayName: 'Acme Security Corporation',
              superAdminEmail: 'admin@acme.com',
              superAdminPassword: tenantBootstrapPassword,
              superAdminName: 'Acme Super Admin',
              createdBy: 'usr_platform_admin_001'
            });
            // Seed default End User
            await tenantService.createEndUser('acme-security', {
              email: 'dev@acme.com',
              password: endUserBootstrapPassword,
              name: 'Developer Alice',
              roles: ['END_USER'],
              assignedProjectIds: ['proj_acme-security_default']
            }, 'usr_acme-security_superadmin_01');
            logger.info('Seeded default tenant acme-security with Super Admin (admin@acme.com) and End User (dev@acme.com)');
          }
        }
      } catch (e) {
        logger.warn('Tenant seeding skipped or encountered error', { error: e.message });
      }
    }
  }

  const { app, scanQueue, notificationQueue, scannerWorker } = createApp({
    userRepository,
    sessionRepository,
    auditRepository,
    scanRepository,
    scanComponentRepository,
    scanFindingRepository,
    vulnerabilityIntelligenceRepository,
    tenantRepository,
    projectRepository,
    assetRepository
  });

  const server = app.listen(config.port, () => {
    logger.info(`Enterprise Security Exposure Backend listening on port ${config.port}`, {
      env: config.env,
      port: config.port
    });
  });

  // Graceful shutdown handler
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await cacheService.disconnect();
        if (mongoClient && typeof mongoClient.close === 'function') {
          await mongoClient.close();
          logger.info('MongoDB connections closed.');
        }
        logger.info('Graceful shutdown completed.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during shutdown', { error: err.message });
        process.exit(1);
      }
    });

    // Force close after 10s if stuck
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

if (require.main === module) {
  bootstrap().catch(err => {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = bootstrap;
