'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestServer } = require('../test-helper');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');
const { AuditActions } = require('../../src/domain/entities/audit-event.entity');
const logger = require('../../src/observability/logger');

describe('Security Tests: Brute Force, Replay Protection, Concurrency & Leakage', () => {
  let testEnv;

  before(async () => {
    testEnv = await createTestServer();

    // Create user specifically for brute-force lockout testing
    const bruteUser = new User({
      id: 'usr_brute_test_01',
      email: 'brute@platform.test',
      passwordHash: PasswordPolicy.hash('CorrectPassword#123'),
      status: UserStatus.ACTIVE,
      roles: ['PLATFORM_ADMIN'],
      failedLoginAttempts: 0
    });
    await testEnv.userRepository.save(bruteUser);
  });

  after(async () => {
    await testEnv.close();
  });

  it('Brute-force protection: locks account after 5 consecutive failed attempts', async () => {
    const email = 'brute@platform.test';

    // Send 5 invalid login attempts
    for (let i = 1; i <= 5; i++) {
      const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'WrongPassword' })
      });
      assert.strictEqual(res.status, 401);
    }

    // Verify user is now locked in database
    const lockedUser = await testEnv.userRepository.findByEmail(email);
    assert.strictEqual(lockedUser.status, UserStatus.LOCKED);
    assert.ok(lockedUser.lockedUntil > new Date());
    assert.strictEqual(lockedUser.failedLoginAttempts, 5);

    // Now even with the CORRECT password, login must fail safely
    const correctRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'CorrectPassword#123' })
    });
    assert.strictEqual(correctRes.status, 401);
    const data = await correctRes.json();
    assert.strictEqual(data.error.code, 'INVALID_CREDENTIALS', 'Must not reveal account is locked');

    // Verify audit event auth.account.locked was recorded
    const auditEvents = testEnv.auditRepository.getAllEvents();
    const lockEvents = auditEvents.filter(e => e.action === AuditActions.ACCOUNT_LOCKED);
    assert.ok(lockEvents.length >= 1);
  });

  it('Refresh token replay detection: revokes entire session family on reuse', async () => {
    // 1. Login
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test', password: testEnv.adminPassword })
    });
    const { refreshToken: tokenR1 } = await loginRes.json();

    // 2. Refresh #1 (Token rotates from R1 -> R2)
    const refresh1Res = await fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenR1 })
    });
    assert.strictEqual(refresh1Res.status, 200);
    const { refreshToken: tokenR2 } = await refresh1Res.json();

    // 3. Replay attack: Attacker or compromised client attempts to use OLD token R1 again
    const replayRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenR1 })
    });
    assert.strictEqual(replayRes.status, 401);
    const replayData = await replayRes.json();
    assert.strictEqual(replayData.error.code, 'REFRESH_TOKEN_REUSE_DETECTED');

    // 4. Token family is now invalidated: Even the newest token R2 must now be rejected!
    const newestTokenRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenR2 })
    });
    assert.strictEqual(newestTokenRes.status, 401);

    // 5. Verify audit event for reuse detection
    const auditEvents = testEnv.auditRepository.getAllEvents();
    const reuseEvents = auditEvents.filter(e => e.action === AuditActions.REFRESH_REUSE_DETECTED);
    assert.ok(reuseEvents.length >= 1);
  });

  it('Concurrent refresh requests: only one succeeds, the other fails safely', async () => {
    // Login to get a fresh refresh token
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test', password: testEnv.adminPassword })
    });
    const { refreshToken } = await loginRes.json();

    // Fire two refresh requests simultaneously
    const [resA, resB] = await Promise.all([
      fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      }),
      fetch(`${testEnv.baseUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      })
    ]);

    const statuses = [resA.status, resB.status];
    // Exactly one must succeed (200), and the other must fail (409 or 401)
    assert.ok(statuses.includes(200), 'One request must succeed');
    assert.ok(statuses.some(s => s === 409 || s === 401), 'Conflicting request must fail');
  });

  it('Secret scrubbing: sensitive keys are never exposed in logger output or audit events', () => {
    const rawData = {
      password: 'MySecretPassword123!',
      passwordHash: 'scrypt$123456',
      accessToken: 'header.payload.signature',
      refreshToken: 'session.secret',
      authorization: 'Bearer secret_token',
      safeKey: 'normal_value'
    };

    const scrubbed = logger.scrub(rawData);
    assert.strictEqual(scrubbed.password, '[REDACTED]');
    assert.strictEqual(scrubbed.passwordHash, '[REDACTED]');
    assert.strictEqual(scrubbed.accessToken, '[REDACTED]');
    assert.strictEqual(scrubbed.refreshToken, '[REDACTED]');
    assert.strictEqual(scrubbed.authorization, '[REDACTED]');
    assert.strictEqual(scrubbed.safeKey, 'normal_value');
  });

});
