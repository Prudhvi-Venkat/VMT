'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestServer } = require('../test-helper');

describe('Integration Tests: Authentication Endpoints', () => {
  let testEnv;

  before(async () => {
    testEnv = await createTestServer();
  });

  after(async () => {
    await testEnv.close();
  });

  it('POST /api/v1/auth/login - should authenticate valid Platform Admin', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: testEnv.adminPassword
      })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.accessToken);
    assert.ok(data.refreshToken);
    assert.strictEqual(data.tokenType, 'Bearer');
    assert.strictEqual(typeof data.expiresIn, 'number');
    assert.strictEqual(data.user.email, 'admin@platform.test');
    assert.deepStrictEqual(data.user.roles, ['PLATFORM_ADMIN']);
    assert.strictEqual(data.user.passwordHash, undefined, 'Must not leak passwordHash');

    // Check cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('refreshToken='));
    assert.ok(setCookie.includes('HttpOnly'));
    assert.ok(setCookie.includes('Path=/'), 'Cookie path must be root / for proxy compatibility (G10/G21)');
  });

  it('POST /api/v1/auth/login - should reject invalid credentials with generic 401 error', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: 'WrongPassword123!'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS');
    assert.strictEqual(data.error.message, 'Invalid credentials');
    assert.ok(data.error.requestId);
  });

  it('POST /api/v1/auth/login - should reject non-existent user with generic 401 error', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nonexistent@platform.test',
        password: 'AnyPassword123!'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS');
    assert.strictEqual(data.error.message, 'Invalid credentials');
  });

  it('POST /api/v1/auth/login - should reject disabled user with generic 401 error', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'disabled@platform.test',
        password: 'Password#123'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/login - should reject locked user with generic 401 error', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'locked@platform.test',
        password: 'Password#123'
      })
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS');
  });

  it('POST /api/v1/auth/refresh - should rotate refresh token and issue new access token', async () => {
    // 1. Login to obtain tokens
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: testEnv.adminPassword
      })
    });
    const loginData = await loginRes.json();
    const oldRefreshToken = loginData.refreshToken;

    // 2. Perform refresh
    const refreshRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken })
    });

    assert.strictEqual(refreshRes.status, 200);
    const refreshData = await refreshRes.json();
    assert.ok(refreshData.accessToken);
    assert.ok(refreshData.refreshToken);
    assert.notStrictEqual(refreshData.refreshToken, oldRefreshToken, 'Refresh token must be rotated');
    assert.notStrictEqual(refreshData.accessToken, loginData.accessToken, 'Access token must be newly issued');

    // 3. Test that old refresh token is now rejected (token rotation invalidated it)
    const replayRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken })
    });
    assert.strictEqual(replayRes.status, 401);
  });

  it('GET /api/v1/auth/me - should return safe user profile when authenticated', async () => {
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: testEnv.adminPassword
      })
    });
    const loginData = await loginRes.json();

    const meRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${loginData.accessToken}`
      }
    });

    assert.strictEqual(meRes.status, 200);
    const meData = await meRes.json();
    assert.strictEqual(meData.email, 'admin@platform.test');
    assert.deepStrictEqual(meData.roles, ['PLATFORM_ADMIN']);
    assert.strictEqual(meData.status, 'ACTIVE');
    assert.strictEqual(meData.scope, 'platform');
    assert.ok(typeof meData.name === 'string', 'name must be serialized in /me payload (G16)');
    assert.strictEqual(meData.passwordHash, undefined);
  });

  it('POST /api/v1/auth/logout - should revoke the session', async () => {
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@platform.test',
        password: testEnv.adminPassword
      })
    });
    const loginData = await loginRes.json();

    const logoutRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${loginData.accessToken}`
      }
    });
    assert.strictEqual(logoutRes.status, 200);

    // Session is now revoked, /me should return 401
    const meRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${loginData.accessToken}`
      }
    });
    assert.strictEqual(meRes.status, 401);
    const meData = await meRes.json();
    assert.strictEqual(meData.error.code, 'SESSION_INVALID');
  });

  it('POST /api/v1/auth/logout-all - should revoke all active sessions for the user', async () => {
    // Create two separate sessions
    const loginRes1 = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test', password: testEnv.adminPassword })
    });
    const data1 = await loginRes1.json();

    const loginRes2 = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test', password: testEnv.adminPassword })
    });
    const data2 = await loginRes2.json();

    // Call logout-all using session 1
    const logoutAllRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/logout-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${data1.accessToken}` }
    });
    assert.strictEqual(logoutAllRes.status, 200);

    // Both session 1 and session 2 must now be denied
    const meRes1 = await fetch(`${testEnv.baseUrl}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${data1.accessToken}` }
    });
    assert.strictEqual(meRes1.status, 401);

    const meRes2 = await fetch(`${testEnv.baseUrl}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${data2.accessToken}` }
    });
    assert.strictEqual(meRes2.status, 401);
  });

  it('POST /api/v1/auth/change-password - enforces rate limiting on repeated requests (G9/G19)', async () => {
    let rateLimited = false;
    for (let i = 0; i < 15; i++) {
      const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'old', newPassword: 'new' })
      });
      if (res.status === 429) {
        rateLimited = true;
        const body = await res.json();
        assert.strictEqual(body.error.code, 'RATE_LIMIT_EXCEEDED');
        break;
      }
    }
    assert.strictEqual(rateLimited, true, 'Rate limiter must return HTTP 429 on excessive requests');
  });

  it('POST /api/v1/auth/forgot-password - should succeed with privacy-preserving message', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test' })
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.message.includes('password reset token has been dispatched'));
  });

  it('POST /api/v1/auth/reset-password - should reject invalid reset token with 400', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: 'invalid-nonexistent-token',
        newPassword: 'BrandNewPassword123!'
      })
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'INVALID_RESET_TOKEN');
  });
});
