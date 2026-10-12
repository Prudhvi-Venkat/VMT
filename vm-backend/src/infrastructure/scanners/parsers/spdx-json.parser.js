'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class SpdxJsonParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'spdx-json') return true;
    const fn = (context.filename || '').toLowerCase();
    if (fn.endsWith('.json') && fn.includes('spdx')) return true;
    return false;
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    let spdx;
    try {
      spdx = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(`Failed to parse SPDX JSON: ${err.message}`);
    }

    const components = [];
    const warnings = [];

    const packages = Array.isArray(spdx.packages) ? spdx.packages : [];

    for (const pkg of packages) {
      if (!pkg.name) {
        warnings.push({ value: JSON.stringify(pkg).slice(0, 100), reason: 'SPDX package missing name' });
        continue;
      }

      let purl = null;
      let cpe = null;
      let ecosystem = 'generic';

      if (Array.isArray(pkg.externalRefs)) {
        for (const ref of pkg.externalRefs) {
          if (ref.referenceType === 'purl' || ref.referenceType === 'package-url') {
            purl = ref.referenceLocator;
          } else if (ref.referenceType && ref.referenceType.toLowerCase().includes('cpe')) {
            cpe = ref.referenceLocator;
          }
        }
      }

      let namespace = null;
      let name = pkg.name;
      let version = pkg.versionInfo || null;

      if (purl) {
        try {
          const parsed = PackageUrl.parse(purl);
          ecosystem = parsed.type;
          if (parsed.namespace) namespace = parsed.namespace;
          if (parsed.name) name = parsed.name;
          if (!version && parsed.version) version = parsed.version;
        } catch (e) {
          warnings.push({ value: purl, reason: `Invalid purl in SPDX package: ${e.message}` });
        }
      }

      const hashes = [];
      if (Array.isArray(pkg.checksums)) {
        for (const chk of pkg.checksums) {
          if (chk.algorithm && chk.checksumValue) {
            hashes.push({ algorithm: chk.algorithm.toLowerCase(), value: chk.checksumValue });
          }
        }
      }

      components.push({
        name,
        namespace,
        vendor: pkg.supplier || namespace || null,
        declaredVersion: version,
        resolvedVersion: version,
        versionConstraint: version,
        ecosystem,
        packageManager: ecosystem,
        componentType: 'application',
        purl,
        cpe,
        scope: 'runtime',
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'spdx.json',
        sourceFormat: 'spdx-json',
        hashes,
        metadata: {
          spdxId: pkg.SPDXID,
          licenseConcluded: pkg.licenseConcluded
        }
      });
    }

    return { components, warnings };
  }
}

module.exports = SpdxJsonParser;
