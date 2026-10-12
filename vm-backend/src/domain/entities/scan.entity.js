'use strict';

const crypto = require('crypto');

const ScanStatus = {
  QUEUED: 'QUEUED',
  PARSING: 'PARSING',
  NORMALIZING: 'NORMALIZING',
  MATCHING: 'MATCHING',
  ENRICHING: 'ENRICHING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_WARNINGS: 'COMPLETED_WITH_WARNINGS',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

// Statuses representing a scan that is still being processed ("active").
const ACTIVE_SCAN_STATUSES = [
  ScanStatus.QUEUED,
  ScanStatus.PARSING,
  ScanStatus.NORMALIZING,
  ScanStatus.MATCHING,
  ScanStatus.ENRICHING
];

class Scan {
  constructor({
    id,
    tenantId,
    createdBy,
    projectId = null,
    assetId = null,
    name = null,
    originalFileName,
    fileType = 'unknown',
    fileSize = 0,
    checksum = '',
    status = ScanStatus.QUEUED,
    componentCount = 0,
    vulnerableComponentCount = 0,
    findingCount = 0,
    criticalCount = 0,
    highCount = 0,
    mediumCount = 0,
    lowCount = 0,
    unknownCount = 0,
    warningCount = 0,
    errorCount = 0,
    warnings = [],
    errors = [],
    progress = { stage: 'QUEUED', totalComponents: 0, processedComponents: 0, percentage: 0 },
    error = null,
    startedAt = null,
    completedAt = null,
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    if (!tenantId) {
      throw new Error('Scan requires a valid tenantId for tenant isolation');
    }
    if (!originalFileName) {
      throw new Error('Scan requires originalFileName');
    }

    this.id = id || `scan_${crypto.randomUUID()}`;
    this.tenantId = tenantId;
    this.createdBy = createdBy || 'system';
    this.userId = this.createdBy;
    this.projectId = projectId;
    this.assetId = assetId;
    this.name = name || originalFileName;
    this.originalFileName = originalFileName;
    this.fileType = fileType;
    this.fileSize = fileSize;
    this.checksum = checksum;
    this.status = status;
    this.componentCount = componentCount;
    this.vulnerableComponentCount = vulnerableComponentCount;
    this.findingCount = findingCount;
    this.criticalCount = criticalCount;
    this.highCount = highCount;
    this.mediumCount = mediumCount;
    this.lowCount = lowCount;
    this.unknownCount = unknownCount;
    this.warningCount = warningCount;
    this.errorCount = errorCount;
    this.warnings = warnings;
    this.errors = errors;
    this.progress = progress;
    this.error = error;
    this.startedAt = startedAt ? new Date(startedAt) : null;
    this.completedAt = completedAt ? new Date(completedAt) : null;
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }

  updateProgress(stage, processedComponents, totalComponents) {
    this.status = stage;
    const percentage = totalComponents > 0
      ? Math.min(100, Math.round((processedComponents / totalComponents) * 1000) / 10)
      : (stage === ScanStatus.COMPLETED ? 100 : 0);

    this.progress = {
      stage,
      totalComponents,
      processedComponents,
      percentage
    };
    this.updatedAt = new Date();
  }

  addWarning(warning) {
    this.warnings.push(warning);
    this.warningCount = this.warnings.length;
    this.updatedAt = new Date();
  }

  fail(code, message) {
    this.status = ScanStatus.FAILED;
    this.error = { code, message };
    this.errorCount += 1;
    this.completedAt = new Date();
    this.updatedAt = new Date();
  }

  complete() {
    this.status = this.warnings.length > 0
      ? ScanStatus.COMPLETED_WITH_WARNINGS
      : ScanStatus.COMPLETED;
    this.completedAt = new Date();
    this.progress.percentage = 100;
    this.progress.stage = this.status;
    this.updatedAt = new Date();
  }
}

module.exports = {
  Scan,
  ScanStatus,
  ACTIVE_SCAN_STATUSES
};
