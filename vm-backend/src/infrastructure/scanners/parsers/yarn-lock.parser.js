'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class YarnLockParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'yarn.lock') return true;
    return (context.filename || '').toLowerCase().endsWith('yarn.lock');
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    const components = [];
    const warnings = [];
    const seen = new Set();

    const lines = rawContent.split(/\r?\n/);
    let currentPkgHeaders = [];
    let currentVersion = null;
    let currentIntegrity = null;

    const commitCurrent = () => {
      if (currentPkgHeaders.length > 0 && currentVersion) {
        for (const header of currentPkgHeaders) {
          // header might be: "axios@^1.7.0" or "@scope/pkg@^1.0.0, @scope/pkg@^1.2.0"
          const cleanHeader = header.replace(/^"(.*)"$/, '$1').trim();
          const lastAt = cleanHeader.lastIndexOf('@');
          if (lastAt <= 0) continue;

          const pkgName = cleanHeader.slice(0, lastAt);
          const key = `${pkgName}@${currentVersion}`;
          if (seen.has(key)) continue;
          seen.add(key);

          let namespace = null;
          let name = pkgName;
          if (pkgName.startsWith('@') && pkgName.includes('/')) {
            const parts = pkgName.split('/');
            namespace = parts[0];
            name = parts.slice(1).join('/');
          }

          const purl = PackageUrl.create({
            type: 'npm',
            namespace,
            name,
            version: currentVersion
          }).toString();

          const hashes = [];
          if (currentIntegrity) {
            const parts = currentIntegrity.split('-');
            hashes.push({ algorithm: parts[0] || 'integrity', value: parts[1] || currentIntegrity });
          }

          components.push({
            name: pkgName,
            namespace,
            vendor: namespace ? namespace.replace('@', '') : null,
            declaredVersion: cleanHeader.slice(lastAt + 1),
            resolvedVersion: currentVersion,
            versionConstraint: cleanHeader.slice(lastAt + 1),
            ecosystem: 'npm',
            packageManager: 'yarn',
            componentType: 'application',
            purl,
            scope: 'runtime',
            directDependency: true,
            dependencyDepth: 1,
            sourceFile: context.filename || 'yarn.lock',
            sourceFormat: 'yarn.lock',
            hashes,
            metadata: {}
          });
        }
      }
      currentPkgHeaders = [];
      currentVersion = null;
      currentIntegrity = null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;

      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        // New block header (e.g. "axios@^1.7.0", "@scope/foo@^1.0.0, @scope/foo@^2.0.0":)
        commitCurrent();
        const headerLine = line.replace(/:$/, '').trim();
        const parts = headerLine.split(',').map(s => s.trim().replace(/^"(.*)"$/, '$1'));
        currentPkgHeaders.push(...parts);
      } else {
        const trimmed = line.trim();
        if (trimmed.startsWith('version ')) {
          currentVersion = trimmed.replace(/^version\s+["']?([^"']+)["']?$/, '$1');
        } else if (trimmed.startsWith('integrity ')) {
          currentIntegrity = trimmed.replace(/^integrity\s+["']?([^"']+)["']?$/, '$1');
        }
      }
    }
    commitCurrent();

    return { components, warnings };
  }
}

module.exports = YarnLockParser;
