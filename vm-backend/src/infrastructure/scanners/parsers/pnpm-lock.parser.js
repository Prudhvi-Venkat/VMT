'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class PnpmLockParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'pnpm-lock.yaml') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('pnpm-lock.yaml') || fn.endsWith('pnpm-lock.yml');
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    const components = [];
    const warnings = [];
    const seen = new Set();

    // Line-by-line scanner for package entries in pnpm-lock.yaml
    const lines = rawContent.split(/\r?\n/);
    let inPackages = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('packages:')) {
        inPackages = true;
        continue;
      }
      if (inPackages && !line.startsWith(' ') && !line.startsWith('\t') && line.includes(':')) {
        inPackages = false;
      }

      if (inPackages) {
        // e.g. "  /axios@1.7.9:" or "  /@scope/pkg@1.0.0(dep@2.0.0):" or "  'axios@1.7.9':"
        const trimmed = line.trim();
        if (trimmed.endsWith(':') && (trimmed.startsWith('/') || trimmed.startsWith('\'/') || !trimmed.startsWith(' '))) {
          let spec = trimmed.replace(/:$/, '').replace(/^['"]|['"]$/g, '');
          if (spec.startsWith('/')) spec = spec.slice(1);

          // Strip peer dep parentheses e.g. axios@1.7.9(foo@1.0)
          const parenIdx = spec.indexOf('(');
          if (parenIdx !== -1) {
            spec = spec.slice(0, parenIdx);
          }

          const lastAt = spec.lastIndexOf('@');
          if (lastAt > 0) {
            const pkgName = spec.slice(0, lastAt);
            const version = spec.slice(lastAt + 1);

            const key = `${pkgName}@${version}`;
            if (!seen.has(key)) {
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
                version
              }).toString();

              components.push({
                name: pkgName,
                namespace,
                vendor: namespace ? namespace.replace('@', '') : null,
                declaredVersion: version,
                resolvedVersion: version,
                versionConstraint: version,
                ecosystem: 'npm',
                packageManager: 'pnpm',
                componentType: 'application',
                purl,
                scope: 'runtime',
                directDependency: false,
                dependencyDepth: 1,
                sourceFile: context.filename || 'pnpm-lock.yaml',
                sourceFormat: 'pnpm-lock.yaml',
                metadata: {}
              });
            }
          }
        }
      }
    }

    return { components, warnings };
  }
}

module.exports = PnpmLockParser;
