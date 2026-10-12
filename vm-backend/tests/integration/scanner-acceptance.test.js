'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');

describe('Universal Scanner Acceptance Test (Section 46)', () => {
  let testEnv;
  let accessToken;

  before(async () => {
    testEnv = await createTestServer();

    // Authenticate as Platform Admin
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEnv.platformAdmin.email,
        password: testEnv.adminPassword
      })
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    accessToken = loginData.accessToken;
    assert.ok(accessToken);
  });

  after(async () => {
    await testEnv.close();
  });

  it('Section 46 Acceptance Scenario: upload package.json with axios:1.7.9 -> verify full finding chain', async () => {
    // 1. Upload package.json containing axios 1.7.9
    const packageJsonContent = JSON.stringify({
      dependencies: {
        axios: '1.7.9'
      }
    });

    const uploadRes = await fetch(`${testEnv.baseUrl}/api/v1/scans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'package.json',
        content: packageJsonContent
      })
    });

    // 2 & 3 & 4. Verify 202 Accepted, scanId returned, status QUEUED
    assert.equal(uploadRes.status, 202);
    const uploadData = await uploadRes.json();
    assert.ok(uploadData.scanId);
    assert.equal(uploadData.status, 'QUEUED');
    assert.equal(uploadData.message, 'Scan accepted for processing');

    const scanId = uploadData.scanId;

    // Wait briefly for background worker to process the queued scan
    let scanData = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 100));
      const pollRes = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      assert.equal(pollRes.status, 200);
      scanData = await pollRes.json();
      if (scanData.status === 'COMPLETED' || scanData.status === 'COMPLETED_WITH_WARNINGS' || scanData.status === 'FAILED') {
        break;
      }
    }

    // 16. Mark scan COMPLETED
    assert.ok(
      scanData.status === 'COMPLETED' || scanData.status === 'COMPLETED_WITH_WARNINGS',
      `Expected scan to be completed, got status: ${scanData.status}, error: ${JSON.stringify(scanData.error)}`
    );
    assert.equal(scanData.componentCount, 1);
    assert.equal(scanData.vulnerableComponentCount, 1);
    assert.ok(scanData.findingCount > 0);

    // 17. Return vulnerable component through API
    const compRes = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/components`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    assert.equal(compRes.status, 200);
    const compData = await compRes.json();
    assert.equal(compData.items.length, 1);
    const axiosComp = compData.items[0];
    assert.equal(axiosComp.name, 'axios');
    assert.equal(axiosComp.resolvedVersion, '1.7.9');
    assert.equal(axiosComp.ecosystem, 'npm');
    assert.equal(axiosComp.vulnerable, true);

    // 18. Return CVE details and findings
    const findingsRes = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/findings`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    assert.equal(findingsRes.status, 200);
    const findingsData = await findingsRes.json();
    assert.ok(findingsData.items.length > 0);

    // Find CVE-2026-25639
    const cve2026 = findingsData.items.find(f => f.vulnerability.cveId === 'CVE-2026-25639');
    assert.ok(cve2026, 'Finding for CVE-2026-25639 must be present');

    // 19. Return affected version evidence
    assert.equal(cve2026.versionEvidence.installedVersion, '1.7.9');
    assert.ok(cve2026.versionEvidence.affectedRange);

    // 20. Return fixed version
    assert.ok(cve2026.versionEvidence.fixedVersions.includes('1.13.5'));
    assert.equal(cve2026.remediation.recommendedVersion, '1.13.5');

    // 21. Return finding status
    assert.equal(cve2026.status, 'OPEN');

    // 22. Return available UI actions
    assert.ok(Array.isArray(cve2026.availableActions));
    assert.ok(cve2026.availableActions.includes('VIEW_DETAILS'));
    assert.ok(cve2026.availableActions.includes('CREATE_REMEDIATION'));
    assert.ok(cve2026.availableActions.includes('MARK_FALSE_POSITIVE'));
    assert.ok(cve2026.availableActions.includes('ACCEPT_RISK'));

    // Check summary endpoint
    const summaryRes = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/summary`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    assert.equal(summaryRes.status, 200);
    const summaryData = await summaryRes.json();
    assert.equal(summaryData.scanId, scanId);
    assert.equal(summaryData.components, 1);
    assert.equal(summaryData.vulnerableComponents, 1);
    assert.ok(summaryData.findings > 0);
  });
});
