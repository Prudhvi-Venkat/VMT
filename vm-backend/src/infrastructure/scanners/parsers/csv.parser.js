'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class CsvParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'csv') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('.csv');
  }

  _parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  async parse(context) {
    const rawContent = typeof context.content === 'string'
      ? context.content
      : context.content.toString('utf8');

    const lines = rawContent.split(/\r?\n/).filter(l => l.trim().length > 0);
    const components = [];
    const warnings = [];

    if (lines.length === 0) {
      return { components, warnings };
    }

    // Header detection
    const headerCells = this._parseCsvLine(lines[0]).map(h => h.toLowerCase().replace(/[\s_-]/g, ''));
    
    // Map column index to standard field
    const colMap = {
      name: headerCells.findIndex(h => ['name', 'package', 'packagename', 'component', 'artifact', 'artifactid'].includes(h)),
      group: headerCells.findIndex(h => ['group', 'groupid', 'namespace', 'vendor'].includes(h)),
      version: headerCells.findIndex(h => ['version', 'ver', 'packageversion', 'componentversion'].includes(h)),
      ecosystem: headerCells.findIndex(h => ['ecosystem', 'packagemanager', 'type', 'lang'].includes(h)),
      purl: headerCells.findIndex(h => ['purl', 'packageurl'].includes(h)),
      cpe: headerCells.findIndex(h => ['cpe', 'cpeuri'].includes(h)),
      scope: headerCells.findIndex(h => ['scope', 'dependencytype'].includes(h))
    };

    const hasHeader = colMap.name !== -1 || colMap.version !== -1 || colMap.purl !== -1;
    const startLine = hasHeader ? 1 : 0;

    // Fallback column map if no header was found
    if (!hasHeader) {
      colMap.name = 0;
      colMap.version = 1;
      colMap.ecosystem = 2;
    }

    for (let i = startLine; i < lines.length; i++) {
      const lineNum = i + 1;
      const row = this._parseCsvLine(lines[i]);
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      let name = colMap.name !== -1 ? row[colMap.name] : null;
      let version = colMap.version !== -1 ? row[colMap.version] : null;
      let group = colMap.group !== -1 ? row[colMap.group] : null;
      let ecosystem = colMap.ecosystem !== -1 ? row[colMap.ecosystem] : 'npm';
      let purl = colMap.purl !== -1 ? row[colMap.purl] : null;
      let cpe = colMap.cpe !== -1 ? row[colMap.cpe] : null;
      let scope = colMap.scope !== -1 ? row[colMap.scope] : 'runtime';

      // If PURL is provided, extract missing fields
      if (purl && purl.startsWith('pkg:')) {
        try {
          const parsed = PackageUrl.parse(purl);
          if (!name) name = parsed.name;
          if (!group) group = parsed.namespace;
          if (!version) version = parsed.version;
          if (!ecosystem) ecosystem = parsed.type;
        } catch (e) {
          warnings.push({
            line: lineNum,
            value: lines[i],
            reason: `Invalid PURL in CSV: ${e.message}`
          });
        }
      }

      if (!name) {
        warnings.push({
          line: lineNum,
          value: lines[i],
          reason: 'Missing package name in CSV row'
        });
        continue;
      }

      if (!purl && name && version && ecosystem) {
        try {
          purl = PackageUrl.create({
            type: ecosystem.toLowerCase(),
            namespace: group || null,
            name,
            version
          }).toString();
        } catch (e) {
          // Leave purl null
        }
      }

      components.push({
        name,
        namespace: group || null,
        vendor: group || null,
        declaredVersion: version,
        resolvedVersion: version,
        versionConstraint: version,
        ecosystem: (ecosystem || 'npm').toLowerCase(),
        packageManager: (ecosystem || 'npm').toLowerCase(),
        componentType: 'application',
        purl,
        cpe: cpe || null,
        scope: scope || 'runtime',
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'dependencies.csv',
        sourceLocation: `row ${lineNum}`,
        sourceFormat: 'csv',
        metadata: {}
      });
    }

    return { components, warnings };
  }
}

module.exports = CsvParser;
