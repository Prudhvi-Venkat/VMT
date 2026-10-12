'use strict';

const crypto = require('crypto');

const ComponentScope = {
  RUNTIME: 'runtime',
  DEVELOPMENT: 'development',
  OPTIONAL: 'optional',
  PROVIDED: 'provided',
  TEST: 'test',
  UNKNOWN: 'unknown'
};

const ResolutionStatus = {
  RESOLVED: 'RESOLVED',
  PARTIAL: 'PARTIAL',
  UNRESOLVED: 'UNRESOLVED'
};

class ScanComponent {
  constructor({
    id,
    tenantId,
    scanId,
    name,
    namespace = null,
    vendor = null,
    ecosystem,
    packageManager = null,
    componentType = 'application',
    declaredVersion = null,
    resolvedVersion = null,
    versionConstraint = null,
    purl = null,
    cpe = null,
    scope = ComponentScope.UNKNOWN,
    directDependency = true,
    dependencyDepth = 0,
    vulnerabilitiesCount = 0,
    vulnerable = false,
    resolutionStatus = ResolutionStatus.UNRESOLVED,
    resolutionMethod = null,
    resolutionConfidence = 0.0,
    sourceFile,
    sourceLocation = null,
    sourceFormat = 'unknown',
    hashes = [],
    metadata = {},
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    if (!tenantId || !scanId || !name || !ecosystem) {
      throw new Error('ScanComponent requires tenantId, scanId, name, and ecosystem');
    }

    this.id = id || `comp_${crypto.randomUUID()}`;
    this.tenantId = tenantId;
    this.scanId = scanId;
    this.name = name;
    this.namespace = namespace;
    this.vendor = vendor;
    this.ecosystem = ecosystem.toLowerCase();
    this.packageManager = packageManager || this.ecosystem;
    this.componentType = componentType;
    this.declaredVersion = declaredVersion;
    this.resolvedVersion = resolvedVersion;
    this.versionConstraint = versionConstraint;
    this.version = resolvedVersion || declaredVersion;
    this.purl = purl;
    this.cpe = cpe;
    this.scope = scope;
    this.directDependency = Boolean(directDependency);
    this.dependencyDepth = dependencyDepth;
    this.vulnerabilitiesCount = vulnerabilitiesCount;
    this.vulnerable = Boolean(vulnerable);
    this.resolutionStatus = resolutionStatus;
    this.resolutionMethod = resolutionMethod;
    this.resolutionConfidence = resolutionConfidence;
    this.sourceFile = sourceFile;
    this.sourceLocation = sourceLocation;
    this.sourceFormat = sourceFormat;
    this.hashes = hashes;
    this.metadata = metadata;
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }
}

module.exports = {
  ScanComponent,
  ComponentScope,
  ResolutionStatus
};
