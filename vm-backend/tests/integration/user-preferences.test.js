'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestServer } = require('../test-helper');

describe('Integration Tests: User Preferences Endpoints', () => {
  let testEnv;
  let accessToken;

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`
  });

  before(async () => {
    testEnv = await createTestServer();

    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: testEnv.adminPassword
      })
    });
    const data = await res.json();
    accessToken = data.accessToken;
  });

  after(async () => {
    await testEnv.close();
  });

  it('GET /api/v1/auth/preferences - should reject unauthenticated requests', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`);
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/v1/auth/preferences - should return default notification preferences', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`, {
      headers: authHeaders()
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.data, {
      notifications: {
        emailOnCritical: true,
        emailOnScanComplete: true,
        emailOnSlaBreach: true
      }
    });
  });

  it('PUT /api/v1/auth/preferences - should persist partial updates and keep defaults for the rest', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        preferences: { notifications: { emailOnCritical: false } }
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.deepStrictEqual(body.data.notifications, {
      emailOnCritical: false,
      emailOnScanComplete: true,
      emailOnSlaBreach: true
    });

    // Persisted: a fresh GET reflects the update
    const verify = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`, {
      headers: authHeaders()
    });
    const verifyBody = await verify.json();
    assert.strictEqual(verifyBody.data.notifications.emailOnCritical, false);
    assert.strictEqual(verifyBody.data.notifications.emailOnScanComplete, true);
  });

  it('PUT /api/v1/auth/preferences - should ignore non-boolean and unknown values', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        preferences: {
          notifications: { emailOnSlaBreach: 'yes', injected: true },
          evil: 'payload'
        }
      })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body.data, {
      notifications: {
        emailOnCritical: false,
        emailOnScanComplete: true,
        emailOnSlaBreach: true
      }
    });
    assert.strictEqual(body.data.evil, undefined);
  });

  it('PUT /api/v1/auth/preferences - should reject non-object payloads with 400', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/preferences`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ preferences: 'not-an-object' })
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'INVALID_REQUEST');
  });
});
