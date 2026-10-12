'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class PackageLockParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'package-lock.json' || context.fileType === 'npm-shrinkwrap.json') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('package-lock.json') || fn.endsWith('npm-shrinkwrap.json');
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    let lockfile;
    try {
      lockfile = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(`Failed to parse lockfile: ${err.message}`);
    }

    const components = [];
    const warnings = [];
    const seen = new Set();

    // Strategy 1: npm v2/v3 lockfiles ("packages" field)
    if (lockfile.packages && typeof lockfile.packages === 'object') {
      for (const [pkgPath, pkgData] of Object.entries(lockfile.packages)) {
        if (!pkgPath || pkgPath === '') continue; // Skip root project descriptor

        // e.g. "node_modules/axios" or "node_modules/@scope/pkg" or nested "node_modules/a/node_modules/b"
        const nodeModulesIdx = pkgPath.lastIndexOf('node_modules/');
        if (nodeModulesIdx === -1) continue;

        const pkgName = pkgPath.slice(nodeModulesIdx + 'node_modules/'.length);
        const resolvedVersion = pkgData.version;
        if (!pkgName || !resolvedVersion) continue;

        const key = `${pkgName}@${resolvedVersion}`;
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
          version: resolvedVersion
        }).toString();

        const depth = (pkgPath.match(/node_modules\//g) || []).length;
        const isDev = Boolean(pkgData.dev);

        const hashes = [];
        if (pkgData.integrity) {
          const parts = pkgData.integrity.split('-');
          if (parts.length === 2) {
            hashes.push({ algorithm: parts[0], value: parts[1] });
          } else {
            hashes.push({ algorithm: 'integrity', value: pkgData.integrity });
          }
        }

        components.push({
          name: pkgName,
          namespace,
          vendor: namespace ? namespace.replace('@', '') : null,
          declaredVersion: pkgData.version,
          resolvedVersion,
          versionConstraint: pkgData.version,
          ecosystem: 'npm',
          packageManager: 'npm',
          componentType: 'application',
          purl,
          scope: isDev ? 'development' : 'runtime',
          directDependency: depth === 1,
          dependencyDepth: depth,
          sourceFile: context.filename || 'package-lock.json',
          sourceFormat: 'package-lock.json',
          hashes,
          metadata: {
            resolved: pkgData.resolved,
            requires: pkgData.dependencies || {}
          }
        });
      }
    }

    // Strategy 2: npm v1 lockfiles or fallback ("dependencies" field)
    if (components.length === 0 && lockfile.dependencies && typeof lockfile.dependencies === 'object') {
      const processDeps = (depsObj, depth = 1) => {
        for (const [pkgName, depData] of Object.entries(depsObj)) {
          if (!pkgName || !depData || !depData.version) continue;

          const key = `${pkgName}@${depData.version}`;
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
              version: depData.version
            }).toString();

            const hashes = [];
            if (depData.integrity) {
              const parts = depData.integrity.split('-');
              hashes.push({ algorithm: parts[0] || 'integrity', value: parts[1] || depData.integrity });
            }

            components.push({
              name: pkgName,
              namespace,
              vendor: namespace ? namespace.replace('@', '') : null,
              declaredVersion: depData.version,
              resolvedVersion: depData.version,
              versionConstraint: depData.version,
              ecosystem: 'npm',
              packageManager: 'npm',
              componentType: 'application',
              purl,
              scope: depData.dev ? 'development' : 'runtime',
              directDependency: depth === 1,
              dependencyDepth: depth,
              sourceFile: context.filename || 'package-lock.json',
              sourceFormat: 'package-lock.json',
              hashes,
              metadata: {
                resolved: depData.resolved
              }
            });
          }

          if (depData.dependencies && typeof depData.dependencies === 'object') {
            processDeps(depData.dependencies, depth + 1);
          }
        }
      };

      processDeps(lockfile.dependencies, 1);
    }

    return { components, warnings };
  }
}

module.exports = PackageLockParser;
