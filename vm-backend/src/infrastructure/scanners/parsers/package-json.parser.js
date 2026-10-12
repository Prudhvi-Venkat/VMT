'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

const EXACT_SEMVER_REGEX = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

class PackageJsonParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'package.json') return true;
    if (context.filename && context.filename.toLowerCase().endsWith('package.json')) return true;
    return false;
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    let manifest;
    try {
      manifest = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(`Failed to parse package.json: ${err.message}`);
    }

    const components = [];
    const warnings = [];

    const sections = [
      { key: 'dependencies', scope: 'runtime', direct: true },
      { key: 'devDependencies', scope: 'development', direct: true },
      { key: 'optionalDependencies', scope: 'optional', direct: true },
      { key: 'peerDependencies', scope: 'runtime', direct: false }
    ];

    const seenPackages = new Set();

    for (const section of sections) {
      const deps = manifest[section.key];
      if (!deps || typeof deps !== 'object') continue;

      for (const [pkgName, versionConstraint] of Object.entries(deps)) {
        if (!pkgName || typeof versionConstraint !== 'string') {
          warnings.push({
            value: `${pkgName}: ${versionConstraint}`,
            reason: `Invalid dependency entry in ${section.key}`
          });
          continue;
        }

        const trimmedVersion = versionConstraint.trim();
        const isExact = EXACT_SEMVER_REGEX.test(trimmedVersion);
        const resolvedVersion = isExact ? trimmedVersion : null;
        const declaredVersion = trimmedVersion;

        // Extract namespace if scoped package (@scope/name)
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
          version: resolvedVersion || (isExact ? declaredVersion : null)
        }).toString();

        components.push({
          name: pkgName,
          namespace,
          vendor: namespace ? namespace.replace('@', '') : null,
          declaredVersion,
          resolvedVersion,
          versionConstraint: declaredVersion,
          ecosystem: 'npm',
          packageManager: 'npm',
          componentType: 'application',
          purl: resolvedVersion ? purl : null,
          scope: section.scope,
          directDependency: section.direct,
          dependencyDepth: section.direct ? 1 : 2,
          sourceFile: context.filename || 'package.json',
          sourceFormat: 'package.json',
          metadata: {
            dependencySection: section.key
          }
        });

        seenPackages.add(pkgName);
      }
    }

    return { components, warnings };
  }
}

module.exports = PackageJsonParser;
