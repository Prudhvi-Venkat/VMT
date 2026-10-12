'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const ParserRegistry = require('../../src/infrastructure/scanners/parser-registry');
const PomXmlParser = require('../../src/infrastructure/scanners/parsers/pom-xml.parser');
const CycloneDxXmlParser = require('../../src/infrastructure/scanners/parsers/cyclonedx-xml.parser');
const SpdxXmlParser = require('../../src/infrastructure/scanners/parsers/spdx-xml.parser');
const MemoryScanRepository = require('../../src/infrastructure/repositories/memory-scan.repository');
const MemoryScanComponentRepository = require('../../src/infrastructure/repositories/memory-scan-component.repository');
const MemoryScanFindingRepository = require('../../src/infrastructure/repositories/memory-scan-finding.repository');
const { Scan } = require('../../src/domain/entities/scan.entity');
const { ScanFinding } = require('../../src/domain/entities/scan-finding.entity');

describe('Scanner Security & Tenant Isolation Tests', () => {
  it('should block XML External Entity (XXE) attacks in pom.xml', async () => {
    const maliciousXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>&xxe;</groupId>
  <artifactId>malicious-app</artifactId>
  <version>1.0.0</version>
</project>`;

    const parser = new PomXmlParser();
    await assert.rejects(
      async () => {
        await parser.parse({ filename: 'pom.xml', content: maliciousXml });
      },
      /XXE_ATTACK_PREVENTED/
    );
  });

  it('should block XXE in CycloneDX and SPDX XML parsers', async () => {
    const maliciousXml = `<?xml version="1.0"?>
<!DOCTYPE bom [ <!ENTITY secret SYSTEM "http://malicious.local/steal"> ]>
<bom xmlns="http://cyclonedx.org/schema/bom/1.4">
  <component type="library">
    <name>&secret;</name>
  </component>
</bom>`;

    const cdxParser = new CycloneDxXmlParser();
    await assert.rejects(
      async () => {
        await cdxParser.parse({ filename: 'bom.xml', content: maliciousXml });
      },
      /XXE_ATTACK_PREVENTED/
    );

    const spdxParser = new SpdxXmlParser();
    await assert.rejects(
      async () => {
        await spdxParser.parse({ filename: 'spdx.xml', content: maliciousXml });
      },
      /XXE_ATTACK_PREVENTED/
    );
  });

  it('should reject files exceeding maximum file size', async () => {
    const smallRegistry = new ParserRegistry({ maxFileSizeMb: 1 }); // 1MB limit
    const largeContent = 'a'.repeat(2 * 1024 * 1024); // 2MB

    await assert.rejects(
      async () => {
        await smallRegistry.parse({ filename: 'test.txt', content: largeContent });
      },
      /FILE_TOO_LARGE/
    );
  });

  it('should strictly isolate scans across tenants', async () => {
    const scanRepo = new MemoryScanRepository();

    const scanA = new Scan({
      id: 'scan_tenant_A',
      tenantId: 'tenant_alpha',
      originalFileName: 'package.json'
    });
    const scanB = new Scan({
      id: 'scan_tenant_B',
      tenantId: 'tenant_beta',
      originalFileName: 'package.json'
    });

    await scanRepo.save(scanA);
    await scanRepo.save(scanB);

    // Tenant Alpha cannot access Tenant Beta's scan
    const foundByOtherTenant = await scanRepo.findById('tenant_alpha', 'scan_tenant_B');
    assert.equal(foundByOtherTenant, null);

    // Tenant Beta cannot access Tenant Alpha's scan
    const foundByOtherTenant2 = await scanRepo.findById('tenant_beta', 'scan_tenant_A');
    assert.equal(foundByOtherTenant2, null);

    // Listing scans for Tenant Alpha returns only Tenant Alpha's scan
    const alphaList = await scanRepo.findByTenant('tenant_alpha');
    assert.equal(alphaList.items.length, 1);
    assert.equal(alphaList.items[0].id, 'scan_tenant_A');
  });

  it('should strictly isolate findings across tenants', async () => {
    const findingRepo = new MemoryScanFindingRepository();

    const findingA = new ScanFinding({
      tenantId: 'tenant_alpha',
      scanId: 'scan_1',
      componentId: 'comp_1',
      vulnerabilityId: 'CVE-2026-0001',
      cveId: 'CVE-2026-0001'
    });

    await findingRepo.saveMany('tenant_alpha', 'scan_1', [findingA]);

    // Querying with tenant_beta context yields empty list
    const betaFindings = await findingRepo.findByScanId('tenant_beta', 'scan_1');
    assert.equal(betaFindings.items.length, 0);

    // Querying with correct tenant context yields the finding
    const alphaFindings = await findingRepo.findByScanId('tenant_alpha', 'scan_1');
    assert.equal(alphaFindings.items.length, 1);
  });
});
