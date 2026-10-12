'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ParserRegistry = require('../../src/infrastructure/scanners/parser-registry');
const FileTypeDetector = require('../../src/infrastructure/scanners/file-type-detector');

describe('Universal Parser Registry & Parsers', () => {
  const registry = new ParserRegistry();

  it('FileTypeDetector should identify file types correctly', () => {
    assert.equal(FileTypeDetector.detect({ filename: 'package.json' }), 'package.json');
    assert.equal(FileTypeDetector.detect({ filename: 'package-lock.json' }), 'package-lock.json');
    assert.equal(FileTypeDetector.detect({ filename: 'yarn.lock' }), 'yarn.lock');
    assert.equal(FileTypeDetector.detect({ filename: 'pnpm-lock.yaml' }), 'pnpm-lock.yaml');
    assert.equal(FileTypeDetector.detect({ filename: 'pom.xml' }), 'pom.xml');
    assert.equal(FileTypeDetector.detect({ filename: 'bom.cdx.json', content: '{"bomFormat":"CycloneDX"}' }), 'cyclonedx-json');
    assert.equal(FileTypeDetector.detect({ filename: 'spdx.json', content: '{"spdxVersion":"SPDX-2.3"}' }), 'spdx-json');
    assert.equal(FileTypeDetector.detect({ filename: 'deps.csv', content: 'package,version\naxios,1.7.9' }), 'csv');
    assert.equal(FileTypeDetector.detect({ filename: 'deps.txt', content: 'axios@1.7.9' }), 'txt');
  });

  it('should parse package.json and distinguish declared from resolved versions', async () => {
    const content = JSON.stringify({
      dependencies: {
        axios: '^1.7.0',
        express: '4.21.2',
        '@types/node': '~20.10.0'
      },
      devDependencies: {
        mocha: '10.2.0'
      }
    });

    const res = await registry.parse({ filename: 'package.json', content });
    assert.equal(res.fileType, 'package.json');
    assert.equal(res.components.length, 4);

    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.declaredVersion, '^1.7.0');
    assert.equal(axiosComp.resolvedVersion, null); // Semver range is not resolved
    assert.equal(axiosComp.scope, 'runtime');

    const expressComp = res.components.find(c => c.name === 'express');
    assert.ok(expressComp);
    assert.equal(expressComp.declaredVersion, '4.21.2');
    assert.equal(expressComp.resolvedVersion, '4.21.2'); // Exact version is resolved

    const mochaComp = res.components.find(c => c.name === 'mocha');
    assert.ok(mochaComp);
    assert.equal(mochaComp.scope, 'development');
  });

  it('should parse the supplied SBOM package.json with all 33 components', async () => {
    const fixturePath = path.join(__dirname, '../../../SBOM/package.json');
    const res = await registry.parse({
      filename: 'package.json',
      content: fs.readFileSync(fixturePath, 'utf8')
    });

    assert.equal(res.components.length, 33);
    assert.ok(res.components.every(component => component.version));
    assert.ok(res.components.some(component => component.declaredVersion));
  });

  it('should parse package-lock.json v2/v3 with exact versions and scoped packages', async () => {
    const content = JSON.stringify({
      name: 'test-app',
      lockfileVersion: 2,
      packages: {
        '': { name: 'test-app' },
        'node_modules/axios': {
          version: '1.7.9',
          resolved: 'https://registry.npmjs.org/axios/-/axios-1.7.9.tgz',
          integrity: 'sha512-test-hash'
        },
        'node_modules/@nestjs/core': {
          version: '10.3.0',
          resolved: 'https://registry.npmjs.org/@nestjs/core/-/core-10.3.0.tgz'
        }
      }
    });

    const res = await registry.parse({ filename: 'package-lock.json', content });
    assert.equal(res.components.length, 2);

    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.resolvedVersion, '1.7.9');
    assert.equal(axiosComp.purl, 'pkg:npm/axios@1.7.9');

    const nestComp = res.components.find(c => c.name === '@nestjs/core');
    assert.ok(nestComp);
    assert.equal(nestComp.namespace, '@nestjs');
    assert.equal(nestComp.resolvedVersion, '10.3.0');
    assert.equal(nestComp.purl, 'pkg:npm/%40nestjs/core@10.3.0');
  });

  it('should parse yarn.lock manifests', async () => {
    const content = `# yarn lockfile v1
axios@^1.7.0:
  version "1.7.9"
  resolved "https://registry.yarnpkg.com/axios/-/axios-1.7.9.tgz"
  integrity sha512-hash==

"@scope/lib@^2.0.0":
  version "2.1.0"
`;

    const res = await registry.parse({ filename: 'yarn.lock', content });
    assert.equal(res.components.length, 2);

    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.resolvedVersion, '1.7.9');
    assert.equal(axiosComp.purl, 'pkg:npm/axios@1.7.9');
  });

  it('should parse pnpm-lock.yaml manifests', async () => {
    const content = `lockfileVersion: '6.0'
packages:
  /axios@1.7.9:
    resolution: {integrity: sha512-test}
  /@types/node@20.10.0:
    resolution: {integrity: sha512-node}
`;

    const res = await registry.parse({ filename: 'pnpm-lock.yaml', content });
    assert.equal(res.components.length, 2);
    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.resolvedVersion, '1.7.9');
  });

  it('should parse pom.xml with properties resolution', async () => {
    const content = `
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <properties>
    <spring.version>2.7.5</spring.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <version>\${spring.version}</version>
    </dependency>
    <dependency>
      <groupId>junit</groupId>
      <artifactId>junit</artifactId>
      <version>4.13.2</version>
      <scope>test</scope>
    </dependency>
  </dependencies>
</project>`;

    const res = await registry.parse({ filename: 'pom.xml', content });
    assert.equal(res.components.length, 2);

    const springComp = res.components.find(c => c.name === 'spring-boot-starter-web');
    assert.ok(springComp);
    assert.equal(springComp.namespace, 'org.springframework.boot');
    assert.equal(springComp.resolvedVersion, '2.7.5');
    assert.equal(springComp.purl, 'pkg:maven/org.springframework.boot/spring-boot-starter-web@2.7.5');

    const junitComp = res.components.find(c => c.name === 'junit');
    assert.equal(junitComp.scope, 'test');
  });

  it('should parse txt package lists and emit warnings on malformed lines', async () => {
    const content = `
axios@1.7.9
express 4.21.2
invalid_line_without_version
pkg:npm/lodash@4.17.21
`;

    const res = await registry.parse({ filename: 'packages.txt', content });
    assert.equal(res.components.length, 3);
    assert.equal(res.warnings.length, 1);
    assert.equal(res.warnings[0].line, 4);

    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.resolvedVersion, '1.7.9');

    const lodashComp = res.components.find(c => c.name === 'lodash');
    assert.ok(lodashComp);
    assert.equal(lodashComp.resolvedVersion, '4.17.21');
  });

  it('should parse CSV dependency lists with header detection', async () => {
    const content = `package,version,ecosystem
axios,1.7.9,npm
django,4.2.0,pypi
`;

    const res = await registry.parse({ filename: 'deps.csv', content });
    assert.equal(res.components.length, 2);

    const axiosComp = res.components.find(c => c.name === 'axios');
    assert.ok(axiosComp);
    assert.equal(axiosComp.resolvedVersion, '1.7.9');
    assert.equal(axiosComp.ecosystem, 'npm');
  });

  it('should parse CycloneDX JSON SBOMs', async () => {
    const content = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.4',
      components: [
        {
          type: 'library',
          name: 'axios',
          version: '1.7.9',
          purl: 'pkg:npm/axios@1.7.9'
        }
      ]
    });

    const res = await registry.parse({ filename: 'bom.cdx.json', content });
    assert.equal(res.components.length, 1);
    assert.equal(res.components[0].name, 'axios');
    assert.equal(res.components[0].resolvedVersion, '1.7.9');
    assert.equal(res.components[0].ecosystem, 'npm');
  });

  it('should parse SPDX JSON SBOMs', async () => {
    const content = JSON.stringify({
      spdxVersion: 'SPDX-2.3',
      SPDXID: 'SPDXRef-DOCUMENT',
      packages: [
        {
          name: 'axios',
          versionInfo: '1.7.9',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:npm/axios@1.7.9'
            }
          ]
        }
      ]
    });

    const res = await registry.parse({ filename: 'sbom.spdx.json', content });
    assert.equal(res.components.length, 1);
    assert.equal(res.components[0].name, 'axios');
    assert.equal(res.components[0].resolvedVersion, '1.7.9');
    assert.equal(res.components[0].ecosystem, 'npm');
  });
});
