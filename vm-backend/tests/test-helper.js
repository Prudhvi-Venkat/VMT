'use strict';

const createApp = require('../src/app');
const MemoryUserRepository = require('../src/infrastructure/repositories/memory-user.repository');
const MemorySessionRepository = require('../src/infrastructure/repositories/memory-session.repository');
const MemoryAuditRepository = require('../src/infrastructure/repositories/memory-audit.repository');
const PasswordPolicy = require('../src/domain/policies/password-policy');
const { User, UserStatus } = require('../src/domain/entities/user.entity');

async function createTestServer() {
  const userRepository = new MemoryUserRepository();
  const sessionRepository = new MemorySessionRepository();
  const auditRepository = new MemoryAuditRepository();

  // Create default Platform Admin user
  const adminPassword = 'PlatformAdmin#2026!';
  const platformAdmin = new User({
    id: 'usr_admin_test_01',
    email: 'admin@platform.test',
    passwordHash: PasswordPolicy.hash(adminPassword),
    status: UserStatus.ACTIVE,
    roles: ['PLATFORM_ADMIN'],
    scope: 'platform'
  });
  await userRepository.save(platformAdmin);

  // Create disabled user
  const disabledUser = new User({
    id: 'usr_disabled_test_02',
    email: 'disabled@platform.test',
    passwordHash: PasswordPolicy.hash('Password#123'),
    status: UserStatus.DISABLED,
    roles: ['PLATFORM_ADMIN'],
    scope: 'platform'
  });
  await userRepository.save(disabledUser);

  // Create locked user
  const lockedUser = new User({
    id: 'usr_locked_test_03',
    email: 'locked@platform.test',
    passwordHash: PasswordPolicy.hash('Password#123'),
    status: UserStatus.LOCKED,
    lockedUntil: new Date(Date.now() + 3600000),
    roles: ['PLATFORM_ADMIN'],
    scope: 'platform'
  });
  await userRepository.save(lockedUser);

  const createdApp = createApp({
    userRepository,
    sessionRepository,
    auditRepository
  });
  const { app, authService, auditService } = createdApp;

  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    userRepository,
    sessionRepository,
    auditRepository,
    scanFindingRepository: createdApp.scanFindingRepository,
    scanRepository: createdApp.scanRepository,
    projectRepository: createdApp.projectRepository,
    tenantRepository: createdApp.tenantRepository,
    tenantManagementService: createdApp.tenantManagementService,
    scannerService: createdApp.scannerService,
    authService,
    auditService,
    adminPassword,
    platformAdmin,
    close: async () => {
      if (server.closeAllConnections) server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      const { tenantDbManager } = require('../src/infrastructure/database/tenant-database-manager');
      await tenantDbManager.close();
    }
  };
}

module.exports = {
  createTestServer
};
