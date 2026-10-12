'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class SpdxXmlParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'spdx-xml') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('.xml') && fn.includes('spdx');
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

    const pkgRegex = /<Package(?:\s+about="([^"]*)")?[^>]*>([\s\S]*?)<\/Package>/gi;
    let match;

    while ((match = pkgRegex.exec(rawContent)) !== null) {
      const body = match[2];

      const nameMatch = body.match(/<name>([^<]+)<\/name>/i);
      const versionMatch = body.match(/<versionInfo>([^<]+)<\/versionInfo>/i);
      const purlMatch = body.match(/<referenceLocator>([^<]+)<\/referenceLocator>/i);

      if (!nameMatch) continue;

      let name = nameMatch[1].trim();
      let version = versionMatch ? versionMatch[1].trim() : null;
      let purl = purlMatch ? purlMatch[1].trim() : null;
      let ecosystem = 'generic';
      let namespace = null;

      if (purl) {
        try {
          const parsed = PackageUrl.parse(purl);
          ecosystem = parsed.type;
          if (parsed.namespace) namespace = parsed.namespace;
          if (parsed.name) name = parsed.name;
          if (!version && parsed.version) version = parsed.version;
        } catch (e) {
          warnings.push({ value: purl, reason: `Invalid purl in SPDX XML: ${e.message}` });
        }
      }

      components.push({
        name,
        namespace,
        vendor: namespace || null,
        declaredVersion: version,
        resolvedVersion: version,
        versionConstraint: version,
        ecosystem,
        packageManager: ecosystem,
        componentType: 'application',
        purl,
        scope: 'runtime',
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'spdx.xml',
        sourceFormat: 'spdx-xml',
        hashes: [],
        metadata: {}
      });
    }

    return { components, warnings };
  }
}

module.exports = SpdxXmlParser;
