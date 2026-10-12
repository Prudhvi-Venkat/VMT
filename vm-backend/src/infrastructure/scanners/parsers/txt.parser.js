'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class TxtParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'txt') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('.txt');
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    const lines = rawContent.split(/\r?\n/);
    const components = [];
    const warnings = [];

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i].trim();

      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue; // Skip comments and empty lines
      }

      // Check for PURL line e.g. "pkg:npm/axios@1.7.9"
      if (line.startsWith('pkg:')) {
        try {
          const parsedPurl = PackageUrl.parse(line);
          components.push({
            name: parsedPurl.name,
            namespace: parsedPurl.namespace,
            vendor: parsedPurl.namespace,
            declaredVersion: parsedPurl.version,
            resolvedVersion: parsedPurl.version,
            versionConstraint: parsedPurl.version,
            ecosystem: parsedPurl.type,
            packageManager: parsedPurl.type,
            componentType: 'application',
            purl: line,
            scope: 'runtime',
            directDependency: true,
            dependencyDepth: 1,
            sourceFile: context.filename || 'dependencies.txt',
            sourceLocation: `line ${lineNum}`,
            sourceFormat: 'txt',
            metadata: {}
          });
          continue;
        } catch (e) {
          warnings.push({
            line: lineNum,
            value: line,
            reason: `Invalid PURL format: ${e.message}`
          });
          continue;
        }
      }

      // Format 1: name@version e.g. "axios@1.7.9" or "@scope/pkg@1.0.0"
      let pkgName = null;
      let version = null;

      if (line.includes('@') && !line.startsWith('@')) {
        const idx = line.lastIndexOf('@');
        pkgName = line.slice(0, idx).trim();
        version = line.slice(idx + 1).trim();
      } else if (line.startsWith('@') && line.indexOf('@', 1) > 0) {
        // Scoped package e.g. "@scope/pkg@1.0.0"
        const idx = line.indexOf('@', 1);
        pkgName = line.slice(0, idx).trim();
        version = line.slice(idx + 1).trim();
      } else if (line.includes('==')) {
        // Format 2: Python requirements e.g. "requests==2.28.0"
        const parts = line.split('==');
        pkgName = parts[0].trim();
        version = parts[1].trim();
      } else if (line.includes(' ') || line.includes('\t')) {
        // Format 3: name version e.g. "axios 1.7.9"
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          pkgName = parts[0].trim();
          version = parts[1].trim();
        }
      }

      if (!pkgName || !version || version.length === 0) {
        warnings.push({
          line: lineNum,
          value: line,
          reason: 'Unable to determine package name/version'
        });
        continue;
      }

      // Default ecosystem: python if ==, otherwise npm or generic
      let ecosystem = 'npm';
      if (line.includes('==')) ecosystem = 'pypi';

      let namespace = null;
      let cleanName = pkgName;
      if (pkgName.startsWith('@') && pkgName.includes('/')) {
        const parts = pkgName.split('/');
        namespace = parts[0];
        cleanName = parts.slice(1).join('/');
      }

      let purl = null;
      try {
        purl = PackageUrl.create({
          type: ecosystem,
          namespace,
          name: cleanName,
          version
        }).toString();
      } catch (e) {
        // Leave purl null if invalid
      }

      components.push({
        name: pkgName,
        namespace,
        vendor: namespace ? namespace.replace('@', '') : null,
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
        sourceFile: context.filename || 'dependencies.txt',
        sourceLocation: `line ${lineNum}`,
        sourceFormat: 'txt',
        metadata: {}
      });
    }

    return { components, warnings };
  }
}

module.exports = TxtParser;
