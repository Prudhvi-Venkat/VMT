'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const MongoScanRepository = require('../../src/infrastructure/repositories/mongodb-scan.repository');
const MongoScanComponentRepository = require('../../src/infrastructure/repositories/mongodb-scan-component.repository');
const MongoScanFindingRepository = require('../../src/infrastructure/repositories/mongodb-scan-finding.repository');
const { Scan } = require('../../src/domain/entities/scan.entity');

describe('P0: Tenant Database Isolation & Fail-Closed Hardening', () => {
  // Mock DB to verify query constraints
  function createMockDb() {
    let lastQuery = null;
    let lastUpdateFilter = null;
    let lastPipeline = null;

    return {
      collection: (name) => ({
        findOne: async (query) => {
          lastQuery = { name, query };
          return null;
        },
        find: (query) => {
          lastQuery = { name, query };
          return {
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  toArray: async () => []
                })
              })
            }),
            skip: () => ({
              limit: () => ({
                toArray: async () => []
              })
            })
          };
        },
        countDocuments: async (query) => {
          lastQuery = { name, query };
          return 0;
        },
        updateOne: async (filter, update) => {
          lastUpdateFilter = { name, filter, update };
          return { modifiedCount: 1 };
        },
        updateMany: async (filter, update) => {
          lastUpdateFilter = { name, filter, update };
          return { modifiedCount: 1 };
        },
        bulkWrite: async (ops) => {
          return { ok: 1 };
        },
        aggregate: (pipeline) => {
          lastPipeline = { name, pipeline };
          return {
            toArray: async () => []
          };
        }
      }),
      getLastQuery: () => lastQuery,
      getLastUpdateFilter: () => lastUpdateFilter,
      getLastPipeline: () => lastPipeline
    };
  }

  describe('MongoScanRepository Fail-Closed & Isolation', () => {
    it('throws fail-closed error when tenantId is null, undefined, or empty', async () => {
      const repo = new MongoScanRepository();

      await assert.rejects(
        () => repo.findById(null, 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.findById(undefined, 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.findById('', 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.findByTenant(null),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.update(null, 'scan-1', { status: 'FAILED' }),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.save({ id: 'scan-1' }),
        /Tenant database resolution failed: scan must contain tenantId/
      );
    });

    it('constrains findById, update, and findByTenant queries by tenantId', async () => {
      const mockDb = createMockDb();
      const repo = new MongoScanRepository(mockDb);

      await repo.findById('tenant-alpha', 'scan-100');
      assert.deepStrictEqual(mockDb.getLastQuery().query, { id: 'scan-100', tenantId: 'tenant-alpha' });

      await repo.update('tenant-alpha', 'scan-100', { progress: 50 });
      assert.deepStrictEqual(mockDb.getLastUpdateFilter().filter, { id: 'scan-100', tenantId: 'tenant-alpha' });

      await repo.findByTenant('tenant-alpha', { status: 'COMPLETED' });
      assert.deepStrictEqual(mockDb.getLastQuery().query.tenantId, 'tenant-alpha');
      assert.strictEqual(mockDb.getLastQuery().query.status, 'COMPLETED');
    });
  });

  describe('MongoScanComponentRepository Fail-Closed & Isolation', () => {
    it('throws fail-closed error when tenantId is null or empty', async () => {
      const repo = new MongoScanComponentRepository();

      await assert.rejects(
        () => repo.findByScanId(null, 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.saveMany(null, 'scan-1', []),
        /tenantId and scanId are required/
      );
    });

    it('constrains findByScanId query by both tenantId and scanId', async () => {
      const mockDb = createMockDb();
      const repo = new MongoScanComponentRepository(mockDb);

      await repo.findByScanId('tenant-beta', 'scan-200');
      assert.strictEqual(mockDb.getLastQuery().query.tenantId, 'tenant-beta');
      assert.strictEqual(mockDb.getLastQuery().query.scanId, 'scan-200');
    });
  });

  describe('MongoScanFindingRepository Fail-Closed & Isolation', () => {
    it('throws fail-closed error when tenantId is null or empty', async () => {
      const repo = new MongoScanFindingRepository();

      await assert.rejects(
        () => repo.getFindingById(null, 'find-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.findByScanId(null, 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.findByTenant(null),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.getSummary(null, 'scan-1'),
        /Tenant database resolution failed: tenantId is required/
      );
      await assert.rejects(
        () => repo.bulkUpdateStatus(null, ['f-1'], { status: 'RESOLVED' }),
        /Tenant database resolution failed: tenantId is required/
      );
    });

    it('constrains getSummary aggregate match by tenantId and scanId', async () => {
      const mockDb = createMockDb();
      const repo = new MongoScanFindingRepository(mockDb);

      await repo.getSummary('tenant-gamma', 'scan-300');
      const pipeline = mockDb.getLastPipeline().pipeline;
      assert.deepStrictEqual(pipeline[0].$match, { tenantId: 'tenant-gamma', scanId: 'scan-300' });
    });

    it('constrains bulkUpdateStatus by both findingIds and tenantId', async () => {
      const mockDb = createMockDb();
      const repo = new MongoScanFindingRepository(mockDb);

      await repo.bulkUpdateStatus('tenant-gamma', ['f-1', 'f-2'], { status: 'RESOLVED' });
      assert.deepStrictEqual(mockDb.getLastUpdateFilter().filter, {
        id: { $in: ['f-1', 'f-2'] },
        tenantId: 'tenant-gamma'
      });
      assert.strictEqual(mockDb.getLastUpdateFilter().update.$set.status, 'RESOLVED');
    });
  });
});
