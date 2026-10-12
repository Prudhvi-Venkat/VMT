'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class CycloneDxJsonParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'cyclonedx-json') return true;
    const fn = (context.filename || '').toLowerCase();
    if (fn.endsWith('.json') && fn.includes('cyclonedx')) return true;
    return false;
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    let bom;
    try {
      bom = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(`Failed to parse CycloneDX JSON: ${err.message}`);
    }

    const components = [];
    const warnings = [];

    const rawComponents = Array.isArray(bom.components) ? bom.components : [];
    // Also include root metadata component if present
    if (bom.metadata && bom.metadata.component) {
      rawComponents.unshift(bom.metadata.component);
    }

    for (const c of rawComponents) {
      if (!c.name) {
        warnings.push({ value: JSON.stringify(c).slice(0, 100), reason: 'CycloneDX component missing name' });
        continue;
      }

      let purl = c.purl || null;
      let ecosystem = 'generic';
      let namespace = c.group || null;
      let name = c.name;
      let version = c.version || null;

      if (purl) {
        try {
          const parsed = PackageUrl.parse(purl);
          ecosystem = parsed.type;
          if (!namespace) namespace = parsed.namespace;
          if (!name) name = parsed.name;
          if (!version) version = parsed.version;
        } catch (e) {
          warnings.push({ value: purl, reason: `Invalid purl in CycloneDX component: ${e.message}` });
        }
      }

      const hashes = [];
      if (Array.isArray(c.hashes)) {
        for (const h of c.hashes) {
          if (h.alg && h.content) {
            hashes.push({ algorithm: h.alg, value: h.content });
          }
        }
      }

      components.push({
        name,
        namespace,
        vendor: c.supplier?.name || c.publisher || namespace || null,
        declaredVersion: version,
        resolvedVersion: version,
        versionConstraint: version,
        ecosystem,
        packageManager: ecosystem,
        componentType: c.type || 'library',
        purl,
        cpe: c.cpe || null,
        scope: c.scope === 'required' ? 'runtime' : (c.scope === 'optional' ? 'optional' : 'runtime'),
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'bom.cdx.json',
        sourceFormat: 'cyclonedx-json',
        hashes,
        metadata: {
          bomRef: c['bom-ref'],
          licenses: c.licenses || []
        }
      });
    }

    return { components, warnings };
  }
}

module.exports = CycloneDxJsonParser;
