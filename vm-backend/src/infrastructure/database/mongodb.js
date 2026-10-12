'use strict';

const config = require('../../config');
const logger = require('../../observability/logger');

const { tenantDbManager } = require('./tenant-database-manager');

async function getMongoClient() {
  try {
    const client = await tenantDbManager.connect();
    if (client) {
      await ensureIndexes(tenantDbManager.getPlatformDb());
    }
    return client;
  } catch (err) {
    logger.warn('MongoDB connection unavailable. In-memory adapter will be used.', { error: err.message });
    return null;
  }
}

function getDb() {
  try {
    return tenantDbManager.getPlatformDb();
  } catch (err) {
    return null;
  }
}

/**
 * Ensures indexes defined in specification Section 28
 */
async function ensureIndexes(db) {
  if (!db) return;
  try {
    // 1. Users Collection Indexes
    // - Unique email index for fast lookup & preventing duplicate accounts
    // - Status index for fast filtering of active accounts
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ status: 1 });

    // 2. Sessions Collection Indexes
    // - Unique id index
    // - userId index for logout-all queries
    // - tokenFamilyId index for token reuse revocation
    // - status index for fast active session lookups
    // - expiresAt index for session expiration checks
    await db.collection('sessions').createIndex({ id: 1 }, { unique: true });
    await db.collection('sessions').createIndex({ userId: 1 });
    await db.collection('sessions').createIndex({ tokenFamilyId: 1 });
    await db.collection('sessions').createIndex({ status: 1 });
    await db.collection('sessions').createIndex({ expiresAt: 1 });

    // 3. Audit Events Collection Indexes
    // - Unique id index
    // - actor.userId for forensics
    // - action for audit filtering
    // - correlationId for request tracing
    // - timestamp for chronological reconstruction
    // Note: NEVER create TTL index on auditEvents to preserve historical evidence (AGENTS.md rule 11)
    await db.collection('auditEvents').createIndex({ id: 1 }, { unique: true });
    await db.collection('auditEvents').createIndex({ 'actor.userId': 1 });
    await db.collection('auditEvents').createIndex({ action: 1 });
    await db.collection('auditEvents').createIndex({ correlationId: 1 });
    await db.collection('auditEvents').createIndex({ timestamp: 1 });

    // 4. Scans Collection Indexes
    await db.collection('scans').createIndex({ id: 1, tenantId: 1 }, { unique: true });
    await db.collection('scans').createIndex({ tenantId: 1, status: 1 });
    await db.collection('scans').createIndex({ tenantId: 1, createdAt: -1 });

    // 5. Scan Components Collection Indexes
    await db.collection('scanComponents').createIndex({ id: 1, tenantId: 1, scanId: 1 }, { unique: true });
    await db.collection('scanComponents').createIndex({ tenantId: 1, scanId: 1 });
    await db.collection('scanComponents').createIndex({ scanId: 1, ecosystem: 1, name: 1 });
    await db.collection('scanComponents').createIndex({ scanId: 1, vulnerable: 1 });

    // 6. Scan Findings Collection Indexes (Deterministic deduplication)
    await db.collection('scanFindings').createIndex(
      { tenantId: 1, scanId: 1, componentId: 1, cveId: 1 },
      { unique: true }
    );
    await db.collection('scanFindings').createIndex({ tenantId: 1, scanId: 1, status: 1 });
    await db.collection('scanFindings').createIndex({ tenantId: 1, scanId: 1, 'vulnerabilitySnapshot.severity': 1 });
    await db.collection('scanFindings').createIndex({ tenantId: 1, scanId: 1, 'vulnerabilitySnapshot.cvssScore': -1 });

    // 7. Vulnerability Intelligence Indexes
    await db.collection('components_database').createIndex({ vendor: 1 });
    await db.collection('components_database').createIndex({ ecosystems: 1 });
    await db.collection('package_catalog').createIndex({ package_name: 1, ecosystem: 1 });
    await db.collection('package_catalog').createIndex({ purl: 1 });

    logger.info('MongoDB indexes verified successfully');
  } catch (err) {
    logger.error('Error creating MongoDB indexes', { error: err.message });
  }
}

async function closeMongoClient() {
  await tenantDbManager.close();
}

module.exports = {
  getMongoClient,
  getDb,
  ensureIndexes,
  closeMongoClient
};
