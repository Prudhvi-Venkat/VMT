'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');

describe('Standardized SBOM Export APIs (CycloneDX & SPDX)', () => {
  let testEnv;
  let accessToken;
  let scanId;

  before(async () => {
    testEnv = await createTestServer();

    // Authenticate
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEnv.platformAdmin.email,
        password: testEnv.adminPassword
      })
    });
    const loginData = await loginRes.json();
    accessToken = loginData.accessToken;

    // Upload a package.json scan
    const uploadRes = await fetch(`${testEnv.baseUrl}/api/v1/scans`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filename: 'package.json',
        content: JSON.stringify({ dependencies: { axios: '1.7.9' } })
      })
    });
    const uploadData = await uploadRes.json();
    scanId = uploadData.scanId;

    // Poll until completed
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 100));
      const pollRes = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const pollData = await pollRes.json();
      if (pollData.status === 'COMPLETED' || pollData.status === 'COMPLETED_WITH_WARNINGS') break;
    }
  });

  after(async () => {
    await testEnv.close();
  });

  it('POST /api/v1/scans/:scanId/export/sbom - CycloneDX JSON format', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/export/sbom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ format: 'CYCLONEDX_JSON' })
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('application/vnd.cyclonedx+json') || res.headers.get('content-type').includes('json'));
    assert.ok(res.headers.get('content-disposition').includes('cyclonedx-sbom-'));

    const text = await res.text();
    const doc = JSON.parse(text);
    assert.equal(doc.bomFormat, 'CycloneDX');
    assert.equal(doc.specVersion, '1.5');
    assert.ok(Array.isArray(doc.components));
    assert.ok(doc.components.some(c => c.name === 'axios'));
  });

  it('POST /api/v1/scans/:scanId/export/sbom - CycloneDX XML format', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/export/sbom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ format: 'CYCLONEDX_XML' })
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('xml'));
    const xml = await res.text();
    assert.ok(xml.includes('<?xml version="1.0"'));
    assert.ok(xml.includes('<bom xmlns="http://cyclonedx.org/schema/bom/1.5"'));
    assert.ok(xml.includes('<name>axios</name>'));
  });

  it('POST /api/v1/scans/:scanId/export/sbom - SPDX JSON format', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/export/sbom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ format: 'SPDX_JSON' })
    });

    assert.equal(res.status, 200);
    assert.ok(res.headers.get('content-type').includes('spdx+json') || res.headers.get('content-type').includes('json'));

    const text = await res.text();
    const doc = JSON.parse(text);
    assert.equal(doc.spdxVersion, 'SPDX-2.3');
    assert.ok(Array.isArray(doc.packages));
    assert.ok(doc.packages.some(p => p.name === 'axios'));
  });

  it('POST /api/v1/scans/:scanId/export/sbom - SPDX XML format', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans/${scanId}/export/sbom`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ format: 'SPDX_XML' })
    });

    assert.equal(res.status, 200);
    const xml = await res.text();
    assert.ok(xml.includes('SpdxDocument'));
    assert.ok(xml.includes('SPDX-2.3'));
    assert.ok(xml.includes('axios'));
  });
});
