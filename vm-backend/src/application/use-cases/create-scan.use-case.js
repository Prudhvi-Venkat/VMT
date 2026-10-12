'use strict';

class CreateScanUseCase {
  constructor({ scannerService }) {
    this.scannerService = scannerService;
  }

  async execute({
    tenantId,
    userId,
    originalFileName,
    fileContent,
    mimeType,
    projectId,
    assetId,
    name,
    reviewedComponents,
    correlationId
  }) {
    return this.scannerService.createScan({
      tenantId,
      userId,
      originalFileName,
      fileContent,
      mimeType,
      projectId,
      assetId,
      name,
      reviewedComponents,
      correlationId
    });
  }
}

module.exports = CreateScanUseCase;
