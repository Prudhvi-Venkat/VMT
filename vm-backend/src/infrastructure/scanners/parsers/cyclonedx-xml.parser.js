'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class CycloneDxXmlParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'cyclonedx-xml') return true;
    const fn = (context.filename || '').toLowerCase();
    if (fn.endsWith('.xml') && fn.includes('cyclonedx')) return true;
    return false;
  }

  _assertSafeXml(content) {
    const upper = content.toUpperCase();
    if (upper.includes('<!DOCTYPE') || upper.includes('<!ENTITY') || upper.includes('SYSTEM "') || upper.includes('SYSTEM \'')) {
      throw new Error('XXE_ATTACK_PREVENTED: External entity or DOCTYPE declarations are prohibited in uploaded XML');
    }
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    this._assertSafeXml(rawContent);

    const components = [];
    const warnings = [];

    const compRegex = /<component(?:\s+type="([^"]*)")?(?:\s+bom-ref="([^"]*)")?[^>]*>([\s\S]*?)<\/component>/gi;
    let match;

    while ((match = compRegex.exec(rawContent)) !== null) {
      const compType = match[1] || 'library';
      const body = match[3];

      const nameMatch = body.match(/<name>([^<]+)<\/name>/i);
      const versionMatch = body.match(/<version>([^<]+)<\/version>/i);
      const groupMatch = body.match(/<group>([^<]+)<\/group>/i);
      const purlMatch = body.match(/<purl>([^<]+)<\/purl>/i);
      const cpeMatch = body.match(/<cpe>([^<]+)<\/cpe>/i);

      if (!nameMatch) continue;

      let name = nameMatch[1].trim();
      let version = versionMatch ? versionMatch[1].trim() : null;
      let group = groupMatch ? groupMatch[1].trim() : null;
      let purl = purlMatch ? purlMatch[1].trim() : null;
      let cpe = cpeMatch ? cpeMatch[1].trim() : null;
      let ecosystem = 'generic';

      if (purl) {
        try {
          const parsed = PackageUrl.parse(purl);
          ecosystem = parsed.type;
          if (!group) group = parsed.namespace;
          if (!name) name = parsed.name;
          if (!version) version = parsed.version;
        } catch (e) {
          warnings.push({ value: purl, reason: `Invalid purl in CycloneDX XML: ${e.message}` });
        }
      }

      components.push({
        name,
        namespace: group || null,
        vendor: group || null,
        declaredVersion: version,
        resolvedVersion: version,
        versionConstraint: version,
        ecosystem,
        packageManager: ecosystem,
        componentType: compType,
        purl,
        cpe,
        scope: 'runtime',
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'bom.cdx.xml',
        sourceFormat: 'cyclonedx-xml',
        hashes: [],
        metadata: {}
      });
    }

    return { components, warnings };
  }
}

module.exports = CycloneDxXmlParser;
