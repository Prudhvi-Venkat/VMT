'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('../test-helper');

describe('Asset Management & Canonical Inventory REST APIs (ADR-009)', () => {
  let testEnv;
  let tenantToken;
  let otherTenantToken;

  before(async () => {
    testEnv = await createTestServer();

    // 1. Register and login Tenant Alpha
    await fetch(`${testEnv.baseUrl}/api/v1/auth/register-tenant-super-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantName: 'Alpha Corp',
        tenantKey: 'tenant-asset-alpha',
        adminName: 'Alice Alpha',
        adminEmail: 'alice@alpha.test',
        adminPassword: 'Password123!',
        environment: 'Production'
      })
    });

    const alphaLogin = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@alpha.test',
        password: 'Password123!'
      })
    });
    const alphaBody = await alphaLogin.json();
    tenantToken = alphaBody.accessToken;

    // 2. Register and login Tenant Beta
    await fetch(`${testEnv.baseUrl}/api/v1/auth/register-tenant-super-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantName: 'Beta Corp',
        tenantKey: 'tenant-asset-beta',
        adminName: 'Bob Beta',
        adminEmail: 'bob@beta.test',
        adminPassword: 'Password123!',
        environment: 'Production'
      })
    });

    const betaLogin = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'bob@beta.test',
        password: 'Password123!'
      })
    });
    const betaBody = await betaLogin.json();
    otherTenantToken = betaBody.accessToken;
  });

  after(async () => {
    if (testEnv) await testEnv.close();
  });

  let createdAssetId;

  it('POST /api/v1/assets - creates and registers a new canonical asset', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        name: 'github.com/acme/payment-service',
        displayName: 'Payment Processing Microservice',
        type: 'REPOSITORY',
        criticality: 'TIER_1_CRITICAL',
        environment: 'PRODUCTION',
        internetFacing: true,
        owner: {
          email: 'payments-team@acme.com',
          teamId: 'team_payments'
        },
        identifiers: ['https://github.com/acme/payment-service.git'],
        tags: { tier: '1', pciDss: 'true' }
      })
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.data.id);
    assert.equal(body.data.name, 'github.com/acme/payment-service');
    assert.equal(body.data.criticality, 'TIER_1_CRITICAL');
    assert.equal(body.data.internetFacing, true);
    createdAssetId = body.data.id;
  });

  it('GET /api/v1/assets - lists assets with pagination metadata', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.equal(body.data.length, 1);
    assert.equal(body.pagination.total, 1);
  });

  it('GET /api/v1/assets/:assetId - retrieves single asset details', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets/${createdAssetId}`, {
      headers: { Authorization: `Bearer ${tenantToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.id, createdAssetId);
    assert.equal(body.data.displayName, 'Payment Processing Microservice');
  });

  it('PATCH /api/v1/assets/:assetId - updates asset criticality and tags', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets/${createdAssetId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`
      },
      body: JSON.stringify({
        displayName: 'Payment Processing Microservice v2',
        criticality: 'TIER_2_HIGH'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.criticality, 'TIER_2_HIGH');
    assert.equal(body.data.displayName, 'Payment Processing Microservice v2');
  });

  it('Tenant Isolation: other tenant cannot read or access asset', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets/${createdAssetId}`, {
      headers: { Authorization: `Bearer ${otherTenantToken}` }
    });

    assert.equal(res.status, 404);
  });

  it('DELETE /api/v1/assets/:assetId - soft-deactivates asset', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/assets/${createdAssetId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tenantToken}` }
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.isActive, false);
  });
});
