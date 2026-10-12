'use strict';

const DependencyParser = require('../../../domain/interfaces/dependency-parser.interface');
const PackageUrl = require('../../../domain/value-objects/package-url');

class PomXmlParser extends DependencyParser {
  supports(context) {
    if (context.fileType === 'pom.xml') return true;
    const fn = (context.filename || '').toLowerCase();
    return fn.endsWith('pom.xml');
  }

  /**
   * Sanitizes XML content and guards against XXE attacks
   */
  _assertSafeXml(content) {
    // Prohibit DOCTYPE and ENTITY declarations to prevent XML External Entity (XXE) injection
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

    // 1. Extract properties: <properties> ... <propName>propValue</propName> ... </properties>
    const properties = {};
    const propertiesMatch = rawContent.match(/<properties>([\s\S]*?)<\/properties>/i);
    if (propertiesMatch) {
      const propBlock = propertiesMatch[1];
      const propRegex = /<([a-zA-Z0-9_.-]+)>([^<]+)<\/\1>/g;
      let m;
      while ((m = propRegex.exec(propBlock)) !== null) {
        properties[m[1]] = m[2].trim();
      }
    }

    // Also extract project version if available
    const projectVersionMatch = rawContent.match(/<modelVersion>[\s\S]*?<\/modelVersion>[\s\S]*?<version>([^<]+)<\/version>/i);
    if (projectVersionMatch) {
      properties['project.version'] = projectVersionMatch[1].trim();
      properties['version'] = projectVersionMatch[1].trim();
    }

    // 2. Extract <dependency> blocks
    const depBlockRegex = /<dependency>([\s\S]*?)<\/dependency>/gi;
    let depMatch;

    while ((depMatch = depBlockRegex.exec(rawContent)) !== null) {
      const block = depMatch[1];

      const groupIdMatch = block.match(/<groupId>([^<]+)<\/groupId>/i);
      const artifactIdMatch = block.match(/<artifactId>([^<]+)<\/artifactId>/i);
      const versionMatch = block.match(/<version>([^<]+)<\/version>/i);
      const scopeMatch = block.match(/<scope>([^<]+)<\/scope>/i);
      const optionalMatch = block.match(/<optional>([^<]+)<\/optional>/i);

      if (!groupIdMatch || !artifactIdMatch) {
        warnings.push({
          value: block.trim().replace(/\s+/g, ' ').slice(0, 100),
          reason: 'Malformed Maven dependency missing groupId or artifactId'
        });
        continue;
      }

      const rawGroupId = groupIdMatch[1].trim();
      const rawArtifactId = artifactIdMatch[1].trim();
      const rawVersion = versionMatch ? versionMatch[1].trim() : null;
      const scopeVal = scopeMatch ? scopeMatch[1].trim().toLowerCase() : 'runtime';
      const isOptional = optionalMatch ? optionalMatch[1].trim().toLowerCase() === 'true' : false;

      // Resolve properties in groupId, artifactId, version
      const resolveProp = (val) => {
        if (!val) return val;
        return val.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          return properties[varName] !== undefined ? properties[varName] : match;
        });
      };

      const groupId = resolveProp(rawGroupId);
      const artifactId = resolveProp(rawArtifactId);
      const version = resolveProp(rawVersion);

      // Check if version remains unresolved variable
      let resolvedVersion = version;
      let declaredVersion = rawVersion;
      if (version && version.includes('${')) {
        warnings.push({
          value: `${groupId}:${artifactId}:${version}`,
          reason: `Unresolved Maven property variable: ${version}`
        });
        resolvedVersion = null; // Do not invent versions
      }

      let scope = 'runtime';
      if (scopeVal === 'test') scope = 'test';
      else if (scopeVal === 'provided') scope = 'provided';
      else if (isOptional) scope = 'optional';

      const purl = resolvedVersion
        ? PackageUrl.create({
            type: 'maven',
            namespace: groupId,
            name: artifactId,
            version: resolvedVersion
          }).toString()
        : null;

      components.push({
        name: artifactId,
        namespace: groupId,
        vendor: groupId,
        declaredVersion,
        resolvedVersion,
        versionConstraint: declaredVersion,
        ecosystem: 'maven',
        packageManager: 'maven',
        componentType: 'application',
        purl,
        scope,
        directDependency: true,
        dependencyDepth: 1,
        sourceFile: context.filename || 'pom.xml',
        sourceFormat: 'pom.xml',
        metadata: {
          scope: scopeVal,
          optional: isOptional
        }
      });
    }

    return { components, warnings };
  }
}

module.exports = PomXmlParser;
