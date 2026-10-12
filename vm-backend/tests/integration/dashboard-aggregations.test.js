'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');

describe('Role-Based Dashboard Aggregation APIs', () => {
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
    const loginData = await loginRes.json();
    accessToken = loginData.accessToken;
  });

  after(async () => {
    await testEnv.close();
  });

  it('GET /api/v1/platform/dashboard - should return platform telemetry and tenant aggregates', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/platform/dashboard`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.tenants);
    assert.ok(body.data.system);
    assert.equal(body.data.system.status, 'HEALTHY');
    assert.ok(typeof body.data.system.uptimeSeconds === 'number');
  });

  it('GET /api/v1/tenant/dashboard - should return tenant metrics, severity breakdown, SLA, and trends', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/tenant/dashboard?range=30d`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.overview);
    assert.ok(body.data.findings);
    assert.ok(body.data.findings.severity);
    assert.ok(Array.isArray(body.data.timeline));
  });

  it('GET /api/v1/me/dashboard - should return current user personal dashboard', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/me/dashboard`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.summary);
    assert.ok(Array.isArray(body.data.recentScans));
    assert.ok(Array.isArray(body.data.urgentFindings));
  });
});
