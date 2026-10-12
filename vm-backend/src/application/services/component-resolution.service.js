'use strict';

const { ScanComponent, ResolutionStatus } = require('../../domain/entities/scan-component.entity');
const PackageUrl = require('../../domain/value-objects/package-url');

class ComponentResolutionService {
  /**
   * Normalizes raw parsed component inputs into canonical ScanComponent domain entities
   * and calculates identity resolution status, method, and confidence.
   */
  resolveComponents({ rawComponents, tenantId, scanId }) {
    const canonicalComponents = [];

    for (const raw of rawComponents) {
      let resolutionStatus = ResolutionStatus.UNRESOLVED;
      let resolutionMethod = 'UNKNOWN';
      let resolutionConfidence = 0.0;

      // 1. PURL exact match
      if (raw.purl && raw.purl.startsWith('pkg:')) {
        resolutionStatus = ResolutionStatus.RESOLVED;
        resolutionMethod = 'PURL';
        resolutionConfidence = 0.99;
      }
      // 2. Ecosystem + Namespace + Name + Version
      else if (raw.ecosystem && raw.namespace && raw.name && (raw.resolvedVersion || raw.declaredVersion)) {
        resolutionStatus = ResolutionStatus.RESOLVED;
        resolutionMethod = 'ECOSYSTEM_NAMESPACE_NAME';
        resolutionConfidence = 0.95;
      }
      // 3. Ecosystem + Name + Version
      else if (raw.ecosystem && raw.name && (raw.resolvedVersion || raw.declaredVersion)) {
        resolutionStatus = ResolutionStatus.RESOLVED;
        resolutionMethod = 'ECOSYSTEM_NAME';
        resolutionConfidence = 0.95;
      }
      // 4. CPE exact match
      else if (raw.cpe && raw.cpe.startsWith('cpe:')) {
        resolutionStatus = ResolutionStatus.RESOLVED;
        resolutionMethod = 'CPE';
        resolutionConfidence = 0.90;
      }
      // 5. Vendor / Name without exact version
      else if (raw.name && (raw.vendor || raw.namespace)) {
        resolutionStatus = ResolutionStatus.PARTIAL;
        resolutionMethod = 'VENDOR_MAPPING';
        resolutionConfidence = 0.80;
      }
      // 6. Name only
      else if (raw.name) {
        resolutionStatus = ResolutionStatus.PARTIAL;
        resolutionMethod = 'NAME_ONLY';
        resolutionConfidence = 0.60;
      } else {
        resolutionStatus = ResolutionStatus.UNRESOLVED;
        resolutionMethod = 'UNRECOGNIZED';
        resolutionConfidence = 0.0;
      }

      // Generate canonical purl if missing but enough info is available
      let purl = raw.purl;
      if (!purl && raw.name && (raw.resolvedVersion || raw.declaredVersion) && raw.ecosystem) {
        try {
          purl = PackageUrl.create({
            type: raw.ecosystem.toLowerCase(),
            namespace: raw.namespace || null,
            name: raw.name,
            version: raw.resolvedVersion || raw.declaredVersion
          }).toString();
        } catch (e) {
          purl = null;
        }
      }

      canonicalComponents.push(new ScanComponent({
        tenantId,
        scanId,
        name: raw.name,
        namespace: raw.namespace,
        vendor: raw.vendor,
        ecosystem: raw.ecosystem || 'generic',
        packageManager: raw.packageManager || raw.ecosystem,
        componentType: raw.componentType || 'application',
        declaredVersion: raw.declaredVersion,
        resolvedVersion: raw.resolvedVersion,
        versionConstraint: raw.versionConstraint,
        purl,
        cpe: raw.cpe,
        scope: raw.scope || 'runtime',
        directDependency: raw.directDependency !== undefined ? raw.directDependency : true,
        dependencyDepth: raw.dependencyDepth || 1,
        resolutionStatus,
        resolutionMethod,
        resolutionConfidence,
        sourceFile: raw.sourceFile || 'unknown',
        sourceLocation: raw.sourceLocation || null,
        sourceFormat: raw.sourceFormat || 'unknown',
        hashes: raw.hashes || [],
        metadata: raw.metadata || {}
      }));
    }

    return canonicalComponents;
  }
}

module.exports = ComponentResolutionService;
