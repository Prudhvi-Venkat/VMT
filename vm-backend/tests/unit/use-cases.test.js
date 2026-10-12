'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CreateScanUseCase,
  CreateTenantUseCase,
  TransitionFindingStatusUseCase,
  ExportSbomUseCase
} = require('../../src/application/use-cases');
const MemoryScanFindingRepository = require('../../src/infrastructure/repositories/memory-scan-finding.repository');
const { ScanFinding, FindingStatus } = require('../../src/domain/entities/scan-finding.entity');

describe('Application Use Cases', () => {
  it('TransitionFindingStatusUseCase: should validate and execute transition with events', async () => {
    const findingRepo = new MemoryScanFindingRepository();
    const testFinding = new ScanFinding({
      id: 'find_uc_001',
      tenantId: 'tenant_uc_test',
      scanId: 'scan_001',
      componentId: 'comp_001',
      vulnerabilityId: 'CVE-2026-1234',
      status: FindingStatus.OPEN
    });
    await findingRepo.saveMany('tenant_uc_test', 'scan_001', [testFinding]);

    const useCase = new TransitionFindingStatusUseCase({
      scanFindingRepository: findingRepo
    });

    const result = await useCase.execute({
      tenantId: 'tenant_uc_test',
      findingId: 'find_uc_001',
      status: FindingStatus.TRIAGED,
      reason: 'Confirmed component in scope',
      changedBy: 'usr_sec_01'
    });

    assert.equal(result.newStatus, 'TRIAGED');
  });

  it('CreateScanUseCase: should delegate scan creation to scanner service', async () => {
    let receivedParams = null;
    const mockScannerService = {
      createScan: async (params) => {
        receivedParams = params;
        return { id: 'scan_mock_01', status: 'QUEUED' };
      }
    };

    const useCase = new CreateScanUseCase({ scannerService: mockScannerService });
    const res = await useCase.execute({
      tenantId: 'tenant_test',
      userId: 'usr_1',
      originalFileName: 'package.json',
      fileContent: '{}'
    });

    assert.equal(res.id, 'scan_mock_01');
    assert.equal(receivedParams.originalFileName, 'package.json');
  });

  it('CreateTenantUseCase: should delegate tenant creation to tenantManagementService', async () => {
    let capturedData = null;
    const mockTenantManagementService = {
      createTenant: async (data) => {
        capturedData = data;
        return { success: true, tenantKey: data.tenantKey };
      }
    };

    const useCase = new CreateTenantUseCase({ tenantManagementService: mockTenantManagementService });
    const result = await useCase.execute({
      tenantKey: 'acme_corp',
      name: 'Acme Corporation',
      superAdminEmail: 'admin@acme.test'
    });

    assert.equal(result.success, true);
    assert.equal(result.tenantKey, 'acme_corp');
    assert.equal(capturedData.name, 'Acme Corporation');
  });

  it('ExportSbomUseCase: should delegate SBOM export to sbomExportService', async () => {
    let capturedArgs = null;
    const mockSbomExportService = {
      exportSbom: async (args) => {
        capturedArgs = args;
        return { filename: 'acme-sbom.json', content: '{"bomFormat":"CycloneDX"}' };
      }
    };

    const useCase = new ExportSbomUseCase({ sbomExportService: mockSbomExportService });
    const result = await useCase.execute({
      tenantId: 'tenant_acme',
      scanId: 'scan_100',
      format: 'JSON',
      standard: 'CYCLONEDX'
    });

    assert.equal(result.filename, 'acme-sbom.json');
    assert.equal(capturedArgs.scanId, 'scan_100');
    assert.equal(capturedArgs.standard, 'CYCLONEDX');
  });
});
