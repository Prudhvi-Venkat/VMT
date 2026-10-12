'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const VulnerabilityScannerService = require('../../src/application/services/vulnerability-scanner.service');
const { Scan, ScanStatus } = require('../../src/domain/entities/scan.entity');

describe('P1: Scan Artifact Durability & Queue Reliability Hardening', () => {
  it('fails closed when durable artifact storage throws an error (rejects with 503 and marks scan FAILED)', async () => {
    let savedScan = null;
    let updatedScan = null;

    const mockScanRepository = {
      save: async (scan) => { savedScan = scan; return scan; },
      update: async (tenantId, scanId, updates) => { updatedScan = { tenantId, scanId, updates }; return updates; },
      findByTenant: async () => ({ items: [], total: 0 })
    };

    const service = new VulnerabilityScannerService({
      scanRepository: mockScanRepository,
      scanComponentRepository: {},
      scanFindingRepository: {},
      parserRegistry: {},
      componentResolutionService: {},
      vulnerabilityMatchingService: {},
      vulnerabilityEnrichmentService: {},
      scanQueue: { enqueue: async () => {} },
      requireDurableStorage: true // Explicit durable storage required!
    });

    // When GridFS fails (e.g. tenantDbManager throws or cannot connect)
    await assert.rejects(
      () => service.createScan({
        tenantId: 'tenant-acme',
        userId: 'usr-1',
        originalFileName: 'package.json',
        fileContent: JSON.stringify({ name: 'test-app', dependencies: { lodash: '4.17.21' } })
      }),
      (err) => {
        assert.strictEqual(err.code, 'DURABLE_STORAGE_FAILED');
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );

    assert.ok(savedScan);
    assert.strictEqual(savedScan.status, ScanStatus.FAILED);
    assert.ok(updatedScan);
    assert.strictEqual(updatedScan.updates.status, ScanStatus.FAILED);
  });

  it('fails closed when scan queue enqueueing fails (marks scan FAILED and throws 500)', async () => {
    let savedScan = null;
    let updatedScan = null;

    const mockScanRepository = {
      save: async (scan) => { savedScan = scan; return scan; },
      update: async (tenantId, scanId, updates) => { updatedScan = { tenantId, scanId, updates }; return updates; },
      findByTenant: async () => ({ items: [], total: 0 })
    };

    const failingQueue = {
      enqueue: async () => {
        throw new Error('Redis broker connection dropped');
      }
    };

    const service = new VulnerabilityScannerService({
      scanRepository: mockScanRepository,
      scanComponentRepository: {},
      scanFindingRepository: {},
      parserRegistry: {},
      componentResolutionService: {},
      vulnerabilityMatchingService: {},
      vulnerabilityEnrichmentService: {},
      scanQueue: failingQueue,
      requireDurableStorage: false
    });

    await assert.rejects(
      () => service.createScan({
        tenantId: 'tenant-acme',
        userId: 'usr-1',
        originalFileName: 'package.json',
        fileContent: JSON.stringify({ name: 'test-app' })
      }),
      (err) => {
        assert.strictEqual(err.code, 'QUEUE_SUBMISSION_FAILED');
        assert.strictEqual(err.statusCode, 500);
        return true;
      }
    );

    assert.ok(savedScan);
    assert.strictEqual(savedScan.status, ScanStatus.FAILED);
    assert.ok(updatedScan);
    assert.strictEqual(updatedScan.updates.status, ScanStatus.FAILED);
  });

  it('safely deduplicates in-flight scans with identical checksum', async () => {
    const fileContent = JSON.stringify({ name: 'idempotent-pkg', version: '1.0.0' });
    const crypto = require('crypto');
    const checksum = crypto.createHash('sha256').update(fileContent).digest('hex');

    const existingInFlightScan = new Scan({
      id: 'scan-in-flight-1',
      tenantId: 'tenant-acme',
      createdBy: 'usr-1',
      originalFileName: 'package.json',
      checksum,
      status: ScanStatus.QUEUED
    });

    let saveCalled = false;
    const mockScanRepository = {
      save: async (scan) => { saveCalled = true; return scan; },
      findByTenant: async (tenantId, filters) => {
        if (filters.active) {
          return { items: [existingInFlightScan], total: 1 };
        }
        return { items: [], total: 0 };
      }
    };

    let enqueueCalled = false;
    const mockQueue = {
      enqueue: async () => { enqueueCalled = true; }
    };

    const service = new VulnerabilityScannerService({
      scanRepository: mockScanRepository,
      scanComponentRepository: {},
      scanFindingRepository: {},
      parserRegistry: {},
      componentResolutionService: {},
      vulnerabilityMatchingService: {},
      vulnerabilityEnrichmentService: {},
      scanQueue: mockQueue,
      requireDurableStorage: false
    });

    const returnedScan = await service.createScan({
      tenantId: 'tenant-acme',
      userId: 'usr-1',
      originalFileName: 'package.json',
      fileContent
    });

    assert.strictEqual(returnedScan.id, 'scan-in-flight-1');
    assert.strictEqual(saveCalled, false, 'Should not save duplicate scan');
    assert.strictEqual(enqueueCalled, false, 'Should not re-enqueue active duplicate scan');
  });
});
