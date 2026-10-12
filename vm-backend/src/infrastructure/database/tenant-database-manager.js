'use strict';

const { MongoClient, GridFSBucket } = require('mongodb');
const config = require('../../config');
const logger = require('../../observability/logger');

class TenantDatabaseManager {
  constructor(options = {}) {
    this.url = options.url || config.database.url;
    this.platformDbName = options.platformDbName || config.database.platformDbName;
    this.intelligenceDbName = options.intelligenceDbName || config.database.intelligenceDbName;
    this.tenantDbPrefix = options.tenantDbPrefix || config.database.tenantDbPrefix;
    
    this.client = null;
    this.isConnecting = false;
    this._initializedTenants = new Set();
  }

  async connect() {
    if (this.client) return this.client;
    if (this.isConnecting) {
      while (this.isConnecting) {
        await new Promise(r => setTimeout(r, 50));
      }
      return this.client;
    }

    this.isConnecting = true;
    try {
      this.client = new MongoClient(this.url, {
        maxPoolSize: 50,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
      });
      await this.client.connect();
      const safeLoggedUrl = typeof this.url === 'string' ? this.url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@') : this.url;
      logger.info('Connected to MongoDB cluster with TenantDatabaseManager', { url: safeLoggedUrl });
      
      // Ensure platform and intelligence database indexes
      await this.ensurePlatformIndexes(this.getPlatformDb());
      await this.ensureIntelligenceIndexes(this.getIntelligenceDb());

      return this.client;
    } catch (err) {
      logger.error('Failed to connect to MongoDB', { error: err.message });
      throw err;
    } finally {
      this.isConnecting = false;
    }
  }

  sanitizeTenantKey(tenantKey) {
    if (!tenantKey || typeof tenantKey !== 'string') {
      throw new Error('Tenant key must be a non-empty string');
    }
    const clean = tenantKey.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    if (!clean || clean.length < 2) {
      throw new Error(`Invalid sanitized tenant key: "${tenantKey}"`);
    }
    return clean;
  }

  getPlatformDb() {
    if (!this.client) throw new Error('TenantDatabaseManager not connected. Call connect() first.');
    return this.client.db(this.platformDbName);
  }

  getIntelligenceDb() {
    if (!this.client) throw new Error('TenantDatabaseManager not connected. Call connect() first.');
    return this.client.db(this.intelligenceDbName);
  }

  getTenantDb(tenantKey) {
    if (!this.client) throw new Error('TenantDatabaseManager not connected. Call connect() first.');
    const sanitized = this.sanitizeTenantKey(tenantKey);
    const dbName = `${this.tenantDbPrefix}${sanitized}`;
    return this.client.db(dbName);
  }

  getTenantGridFSBucket(tenantKey) {
    const tenantDb = this.getTenantDb(tenantKey);
    return new GridFSBucket(tenantDb, { bucketName: 'sbom_artifacts' });
  }

  async ensurePlatformIndexes(db) {
    try {
      await db.collection('tenants').createIndex({ tenantKey: 1 }, { unique: true });
      await db.collection('tenants').createIndex({ status: 1 });
      await db.collection('tenants').createIndex({ createdAt: -1 });

      // Platform Users
      for (const col of ['platform_users', 'users']) {
        await db.collection(col).createIndex({ email: 1 }, { unique: true });
        await db.collection(col).createIndex({ status: 1 });
      }

      // Platform Sessions
      for (const col of ['platform_sessions', 'sessions']) {
        await db.collection(col).createIndex({ id: 1 }, { unique: true });
        await db.collection(col).createIndex({ userId: 1 });
        await db.collection(col).createIndex({ tokenFamilyId: 1 });
        await db.collection(col).createIndex({ status: 1 });
        await db.collection(col).createIndex({ expiresAt: 1 });
      }

      // Platform Audit Logs
      for (const col of ['platform_audit_logs', 'audit_logs', 'auditEvents']) {
        await db.collection(col).createIndex({ id: 1 }, { unique: true });
        await db.collection(col).createIndex({ 'actor.userId': 1 });
        await db.collection(col).createIndex({ action: 1 });
        await db.collection(col).createIndex({ correlationId: 1 });
        await db.collection(col).createIndex({ timestamp: -1 });
      }

      logger.info('Platform database indexes verified successfully');
    } catch (err) {
      logger.error('Error creating platform database indexes', { error: err.message });
    }
  }

  async ensureIntelligenceIndexes(db) {
    try {
      await db.collection('components_database').createIndex({ vendor: 1 });
      await db.collection('components_database').createIndex({ ecosystems: 1 });
      await db.collection('components_database').createIndex({ ecosystem: 1 });
      await db.collection('components_database').createIndex({ name: 1 });

      await db.collection('package_catalog').createIndex({ package_name: 1, ecosystem: 1 });
      await db.collection('package_catalog').createIndex({ purl: 1 });

      await db.collection('cve_database').createIndex({ id: 1 }, { unique: true, sparse: true });
      await db.collection('cve_database').createIndex({ ecosystem: 1 });

      logger.info('Intelligence database indexes verified successfully');
    } catch (err) {
      logger.error('Error creating intelligence database indexes', { error: err.message });
    }
  }

  async ensureTenantIndexes(tenantDb) {
    try {
      // 1. Users & Sessions
      await tenantDb.collection('users').createIndex({ email: 1 }, { unique: true });
      await tenantDb.collection('users').createIndex({ status: 1 });
      await tenantDb.collection('users').createIndex({ roles: 1 });

      await tenantDb.collection('sessions').createIndex({ id: 1 }, { unique: true });
      await tenantDb.collection('sessions').createIndex({ userId: 1 });
      await tenantDb.collection('sessions').createIndex({ tokenFamilyId: 1 });
      await tenantDb.collection('sessions').createIndex({ status: 1 });
      await tenantDb.collection('sessions').createIndex({ expiresAt: 1 });

      // 2. Projects & Memberships
      await tenantDb.collection('projects').createIndex({ key: 1 }, { unique: true });
      await tenantDb.collection('projects').createIndex({ status: 1 });
      await tenantDb.collection('projects').createIndex({ createdAt: -1 });

      await tenantDb.collection('project_members').createIndex({ projectId: 1, userId: 1 }, { unique: true });
      await tenantDb.collection('project_members').createIndex({ userId: 1 });

      // 3. Scans & Components (Canonical scanComponents and legacy scan_components)
      await tenantDb.collection('scans').createIndex({ id: 1 }, { unique: true });
      await tenantDb.collection('scans').createIndex({ projectId: 1, createdAt: -1 });
      await tenantDb.collection('scans').createIndex({ status: 1 });
      await tenantDb.collection('scans').createIndex({ createdAt: -1 });

      for (const col of ['scanComponents', 'scan_components']) {
        await tenantDb.collection(col).createIndex({ id: 1 }, { unique: true });
        await tenantDb.collection(col).createIndex({ scanId: 1 });
        await tenantDb.collection(col).createIndex({ scanId: 1, ecosystem: 1, name: 1 });
        await tenantDb.collection(col).createIndex({ scanId: 1, vulnerable: 1 });
      }

      // 4. Findings & Lifecycle History (Canonical scanFindings and legacy findings)
      for (const col of ['scanFindings', 'findings']) {
        await tenantDb.collection(col).createIndex({ id: 1 }, { unique: true });
        await tenantDb.collection(col).createIndex({ tenantId: 1, scanId: 1, componentId: 1, cveId: 1 }, { unique: true, sparse: true });
        await tenantDb.collection(col).createIndex({ projectId: 1, status: 1 });
        await tenantDb.collection(col).createIndex({ scanId: 1 });
        await tenantDb.collection(col).createIndex({ cveId: 1 });
        await tenantDb.collection(col).createIndex({ componentId: 1 });
        await tenantDb.collection(col).createIndex({ severity: 1 });
        await tenantDb.collection(col).createIndex({ createdAt: -1 });
      }

      await tenantDb.collection('finding_history').createIndex({ findingId: 1, timestamp: -1 });

      // Audit logs
      for (const col of ['audit_logs', 'auditEvents']) {
        await tenantDb.collection(col).createIndex({ id: 1 }, { unique: true });
        await tenantDb.collection(col).createIndex({ userId: 1 });
        await tenantDb.collection(col).createIndex({ 'actor.userId': 1 });
        await tenantDb.collection(col).createIndex({ action: 1 });
        await tenantDb.collection(col).createIndex({ timestamp: -1 });
      }

      // 5. Integrations & Repositories
      await tenantDb.collection('integrations').createIndex({ id: 1 }, { unique: true });
      await tenantDb.collection('integrations').createIndex({ type: 1 });
      await tenantDb.collection('integrations').createIndex({ projectId: 1 });

      await tenantDb.collection('repositories').createIndex({ id: 1 }, { unique: true });
      await tenantDb.collection('repositories').createIndex({ projectId: 1 });
      await tenantDb.collection('repositories').createIndex({ integrationId: 1 });

      // 6. Tenant-Isolated Audit Logs
      await tenantDb.collection('audit_logs').createIndex({ id: 1 }, { unique: true });
      await tenantDb.collection('audit_logs').createIndex({ userId: 1 });
      await tenantDb.collection('audit_logs').createIndex({ action: 1 });
      await tenantDb.collection('audit_logs').createIndex({ projectId: 1 });
      await tenantDb.collection('audit_logs').createIndex({ correlationId: 1 });
      await tenantDb.collection('audit_logs').createIndex({ timestamp: -1 });

      logger.info('Tenant database indexes verified successfully', { database: tenantDb.databaseName });
    } catch (err) {
      logger.error('Error creating tenant database indexes', { database: tenantDb.databaseName, error: err.message });
    }
  }

  async provisionTenantDatabase(tenantKey) {
    const sanitized = this.sanitizeTenantKey(tenantKey);
    const tenantDb = this.getTenantDb(sanitized);
    await this.ensureTenantIndexes(tenantDb);
    this._initializedTenants.add(sanitized);
    return tenantDb;
  }

  async close() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this._initializedTenants.clear();
      logger.info('Closed MongoDB connection in TenantDatabaseManager');
    }
  }
}

// Singleton instance
const tenantDbManagerInstance = new TenantDatabaseManager();

module.exports = {
  TenantDatabaseManager,
  tenantDbManager: tenantDbManagerInstance
};
