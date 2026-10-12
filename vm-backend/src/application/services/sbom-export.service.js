'use strict';

const crypto = require('crypto');

class SbomExportService {
  constructor({ scanRepository, scanComponentRepository, scanFindingRepository }) {
    this.scanRepository = scanRepository;
    this.scanComponentRepository = scanComponentRepository;
    this.scanFindingRepository = scanFindingRepository;
  }

  async generateExport(tenantId, scanId, format = 'CYCLONEDX_JSON') {
    if (!tenantId || !scanId) {
      throw new Error('tenantId and scanId are required');
    }

    const scan = await this.scanRepository.findById(tenantId, scanId);
    if (!scan) {
      const err = new Error(`Scan ${scanId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const [componentsResult, findingsResult] = await Promise.all([
      this.scanComponentRepository.findByScanId(tenantId, scanId, { limit: 1000 }),
      this.scanFindingRepository.findByScanId(tenantId, scanId, { limit: 1000 })
    ]);

    const components = componentsResult.items || [];
    const findings = findingsResult.items || [];

    const normFormat = String(format).toUpperCase().trim();

    switch (normFormat) {
      case 'CYCLONEDX_JSON':
        return this._toCycloneDxJson(scan, components, findings);
      case 'CYCLONEDX_XML':
        return this._toCycloneDxXml(scan, components, findings);
      case 'SPDX_JSON':
        return this._toSpdxJson(scan, components, findings);
      case 'SPDX_XML':
      case 'SPDX_TAG_VALUE':
        return this._toSpdxXml(scan, components, findings);
      default:
        throw new Error(`Unsupported SBOM export format: ${format}. Supported: CYCLONEDX_JSON, CYCLONEDX_XML, SPDX_JSON, SPDX_XML`);
    }
  }

  _toCycloneDxJson(scan, components, findings) {
    const serialNumber = `urn:uuid:${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const cyclonedxDoc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      serialNumber,
      version: 1,
      metadata: {
        timestamp,
        tools: [
          {
            vendor: 'Enterprise Security Exposure Platform',
            name: 'SBOM Intelligence Engine',
            version: '2.0.0'
          }
        ],
        component: {
          bomRef: `pkg:enterprise/${scan.name || 'project'}@${scan.id}`,
          type: 'application',
          name: scan.name || scan.originalFileName || 'application-manifest',
          version: '1.0.0'
        }
      },
      components: components.map(c => {
        const purl = c.purl || `pkg:${c.ecosystem || 'generic'}/${c.name}@${c.resolvedVersion || c.declaredVersion || 'unknown'}`;
        const item = {
          'bom-ref': purl,
          type: 'library',
          name: c.name,
          version: c.resolvedVersion || c.declaredVersion || 'unknown',
          purl,
          scope: c.scope || 'required'
        };
        if (c.licenses && c.licenses.length > 0) {
          item.licenses = c.licenses.map(lic => ({ license: { id: lic } }));
        }
        return item;
      }),
      vulnerabilities: findings.map(f => {
        const targetPurl = f.componentSnapshot?.purl || `pkg:${f.componentSnapshot?.ecosystem}/${f.componentSnapshot?.name}@${f.componentSnapshot?.version}`;
        return {
          id: f.cveId || f.vulnerabilityId,
          source: {
            name: f.cveId ? 'NVD' : 'GLOBAL_INTELLIGENCE',
            url: `https://nvd.nist.gov/vuln/detail/${f.cveId || f.vulnerabilityId}`
          },
          ratings: [
            {
              source: { name: 'CVSS' },
              score: f.vulnerabilitySnapshot?.cvssScore || 0,
              severity: (f.vulnerabilitySnapshot?.severity || 'info').toLowerCase(),
              method: 'CVSSv31'
            }
          ],
          description: f.vulnerabilitySnapshot?.description || '',
          affects: [
            {
              ref: targetPurl,
              versions: [
                {
                  version: f.versionEvidence?.installedVersion || f.componentSnapshot?.version,
                  status: 'affected'
                }
              ]
            }
          ]
        };
      })
    };

    return {
      contentType: 'application/vnd.cyclonedx+json',
      filename: `cyclonedx-sbom-${scan.id}.json`,
      content: JSON.stringify(cyclonedxDoc, null, 2)
    };
  }

  _toCycloneDxXml(scan, components, findings) {
    const serialNumber = `urn:uuid:${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const escapeXml = (unsafe = '') => String(unsafe)
      .replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '\'': '&apos;', '"': '&quot;' }[c]));

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<bom xmlns="http://cyclonedx.org/schema/bom/1.5" serialNumber="${serialNumber}" version="1">\n`;
    xml += `  <metadata>\n`;
    xml += `    <timestamp>${timestamp}</timestamp>\n`;
    xml += `    <tools>\n`;
    xml += `      <tool>\n`;
    xml += `        <vendor>Enterprise Security Exposure Platform</vendor>\n`;
    xml += `        <name>SBOM Intelligence Engine</name>\n`;
    xml += `        <version>2.0.0</version>\n`;
    xml += `      </tool>\n`;
    xml += `    </tools>\n`;
    xml += `    <component type="application">\n`;
    xml += `      <name>${escapeXml(scan.name || scan.originalFileName || 'application')}</name>\n`;
    xml += `      <version>1.0.0</version>\n`;
    xml += `    </component>\n`;
    xml += `  </metadata>\n`;

    xml += `  <components>\n`;
    for (const c of components) {
      const purl = c.purl || `pkg:${c.ecosystem || 'generic'}/${c.name}@${c.resolvedVersion || c.declaredVersion || 'unknown'}`;
      xml += `    <component type="library" bom-ref="${escapeXml(purl)}">\n`;
      xml += `      <name>${escapeXml(c.name)}</name>\n`;
      xml += `      <version>${escapeXml(c.resolvedVersion || c.declaredVersion || 'unknown')}</version>\n`;
      xml += `      <purl>${escapeXml(purl)}</purl>\n`;
      xml += `    </component>\n`;
    }
    xml += `  </components>\n`;

    if (findings.length > 0) {
      xml += `  <vulnerabilities>\n`;
      for (const f of findings) {
        xml += `    <vulnerability>\n`;
        xml += `      <id>${escapeXml(f.cveId || f.vulnerabilityId)}</id>\n`;
        xml += `      <description>${escapeXml(f.vulnerabilitySnapshot?.description || '')}</description>\n`;
        xml += `      <ratings>\n`;
        xml += `        <rating>\n`;
        xml += `          <score>${f.vulnerabilitySnapshot?.cvssScore || 0}</score>\n`;
        xml += `          <severity>${escapeXml((f.vulnerabilitySnapshot?.severity || 'info').toLowerCase())}</severity>\n`;
        xml += `          <method>CVSSv31</method>\n`;
        xml += `        </rating>\n`;
        xml += `      </ratings>\n`;
        xml += `    </vulnerability>\n`;
      }
      xml += `  </vulnerabilities>\n`;
    }

    xml += `</bom>\n`;

    return {
      contentType: 'application/vnd.cyclonedx+xml',
      filename: `cyclonedx-sbom-${scan.id}.xml`,
      content: xml
    };
  }

  _toSpdxJson(scan, components, findings) {
    const spdxId = `SPDXRef-DOCUMENT`;
    const docNamespace = `http://spdx.org/spdxdocs/${scan.id}-${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    const packages = components.map((c, idx) => {
      const pkgRef = `SPDXRef-Package-${idx + 1}-${c.name.replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      return {
        SPDXID: pkgRef,
        name: c.name,
        versionInfo: c.resolvedVersion || c.declaredVersion || '1.0.0',
        downloadLocation: 'NOASSERTION',
        filesAnalyzed: false,
        licenseConcluded: 'NOASSERTION',
        licenseDeclared: 'NOASSERTION',
        copyrightText: 'NOASSERTION',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: c.purl || `pkg:${c.ecosystem || 'generic'}/${c.name}@${c.resolvedVersion || c.declaredVersion || '1.0.0'}`
          }
        ]
      };
    });

    const spdxDoc = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: spdxId,
      name: scan.name || scan.originalFileName || 'application-manifest',
      documentNamespace: docNamespace,
      creationInfo: {
        created: timestamp,
        creators: ['Tool: Enterprise Security Exposure Platform - 2.0.0']
      },
      packages,
      relationships: packages.map(pkg => ({
        spdxElementId: spdxId,
        relatedSpdxElement: pkg.SPDXID,
        relationshipType: 'DESCRIBES'
      }))
    };

    return {
      contentType: 'application/spdx+json',
      filename: `spdx-sbom-${scan.id}.json`,
      content: JSON.stringify(spdxDoc, null, 2)
    };
  }

  _toSpdxXml(scan, components, findings) {
    const timestamp = new Date().toISOString();
    const docNamespace = `http://spdx.org/spdxdocs/${scan.id}-${crypto.randomUUID()}`;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<SpdxDocument xmlns="http://spdx.org/rdf/terms#">\n`;
    xml += `  <specVersion>SPDX-2.3</specVersion>\n`;
    xml += `  <name>${scan.name || scan.originalFileName || 'application-manifest'}</name>\n`;
    xml += `  <documentNamespace>${docNamespace}</documentNamespace>\n`;
    xml += `  <creationInfo>\n`;
    xml += `    <created>${timestamp}</created>\n`;
    xml += `    <creator>Tool: Enterprise Security Exposure Platform - 2.0.0</creator>\n`;
    xml += `  </creationInfo>\n`;
    xml += `  <packages>\n`;
    components.forEach((c, idx) => {
      xml += `    <Package rdf:about="SPDXRef-Package-${idx + 1}">\n`;
      xml += `      <name>${c.name}</name>\n`;
      xml += `      <versionInfo>${c.resolvedVersion || c.declaredVersion || '1.0.0'}</versionInfo>\n`;
      xml += `      <downloadLocation>NOASSERTION</downloadLocation>\n`;
      xml += `    </Package>\n`;
    });
    xml += `  </packages>\n`;
    xml += `</SpdxDocument>\n`;

    return {
      contentType: 'application/xml',
      filename: `spdx-sbom-${scan.id}.xml`,
      content: xml
    };
  }
}

module.exports = SbomExportService;
