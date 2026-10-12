'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { createTestServer } = require('../test-helper');
const JwtService = require('../../src/infrastructure/security/jwt.service');
const PasswordPolicy = require('../../src/domain/policies/password-policy');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');
const { Session, SessionStatus } = require('../../src/domain/entities/session.entity');
const { RolePermissionPolicy } = require('../../src/domain/policies/role-permission-policy');

describe('Authorization & Tenant/Platform Isolation Tests', () => {
  let testEnv;

  before(async () => {
    testEnv = await createTestServer();

    // Create a regular tenant user (future role simulation)
    const tenantUser = new User({
      id: 'usr_tenant_test_01',
      email: 'tenant.user@company.test',
      passwordHash: PasswordPolicy.hash('Password#123'),
      status: UserStatus.ACTIVE,
      roles: ['VIEWER'],
      scope: 'tenant',
      tenantId: 'tenant_abc'
    });
    await testEnv.userRepository.save(tenantUser);
  });

  after(async () => {
    await testEnv.close();
  });

  it('No token -> denied (401)', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`);
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'UNAUTHORIZED');
  });

  it('Invalid token format or tampered signature -> denied (401)', async () => {
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': 'Bearer this.is.invalid' }
    });
    assert.strictEqual(res.status, 401);
  });

  it('Expired token -> denied (401)', async () => {
    // Manually create expired token
    const tokenResult = JwtService.signAccessToken({
      userId: testEnv.platformAdmin.id,
      sessionId: 'ses_expired',
      roles: ['PLATFORM_ADMIN']
    });

    // Tamper with payload exp claim to put it in the past
    const parts = tokenResult.token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    payload.exp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

    // Sign it properly with past exp using JwtService internal secret
    const config = require('../../src/config');
    const crypto = require('crypto');
    const encodedHeader = parts[0];
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const sig = crypto.createHmac('sha256', config.jwt.secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const expiredToken = `${encodedHeader}.${encodedPayload}.${sig}`;

    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': `Bearer ${expiredToken}` }
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'TOKEN_EXPIRED');
  });

  it('Revoked session -> denied (401)', async () => {
    const session = new Session({
      id: 'ses_revoked_test',
      userId: testEnv.platformAdmin.id,
      status: SessionStatus.REVOKED,
      refreshTokenHash: 'dummy'
    });
    await testEnv.sessionRepository.save(session);

    const tokenResult = JwtService.signAccessToken({
      userId: testEnv.platformAdmin.id,
      sessionId: session.id,
      roles: ['PLATFORM_ADMIN']
    });

    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': `Bearer ${tokenResult.token}` }
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'SESSION_INVALID');
  });

  it('Disabled user -> denied (401)', async () => {
    const session = new Session({
      id: 'ses_disabled_user',
      userId: 'usr_disabled_test_02',
      status: SessionStatus.ACTIVE,
      refreshTokenHash: 'dummy'
    });
    await testEnv.sessionRepository.save(session);

    const tokenResult = JwtService.signAccessToken({
      userId: 'usr_disabled_test_02',
      sessionId: session.id,
      roles: ['PLATFORM_ADMIN']
    });

    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': `Bearer ${tokenResult.token}` }
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'USER_INACTIVE');
  });

  it('PLATFORM_ADMIN role -> allowed (200)', async () => {
    const loginRes = await fetch(`${testEnv.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@platform.test', password: testEnv.adminPassword })
    });
    const loginData = await loginRes.json();

    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': `Bearer ${loginData.accessToken}` }
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'AUTHORIZED');
    assert.strictEqual(data.principal.roles.includes('PLATFORM_ADMIN'), true);
    assert.strictEqual(data.principal.scope, 'platform');
  });

  it('Tenant-scoped non-platform user -> denied (403 Forbidden)', async () => {
    // Authenticate tenant user (has VIEWER role and tenant scope)
    const session = new Session({
      id: 'ses_tenant_view',
      userId: 'usr_tenant_test_01',
      status: SessionStatus.ACTIVE,
      platformScope: 'tenant',
      refreshTokenHash: 'dummy'
    });
    await testEnv.sessionRepository.save(session);

    const tokenResult = JwtService.signAccessToken({
      userId: 'usr_tenant_test_01',
      sessionId: session.id,
      roles: ['VIEWER'],
      scope: 'tenant'
    });

    // Tenant user tries to access Platform Admin route
    const res = await fetch(`${testEnv.baseUrl}/api/v1/auth/admin/verify`, {
      headers: { 'Authorization': `Bearer ${tokenResult.token}` }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'FORBIDDEN');
  });

  it('DATA-004: Scanner endpoint rejects token with missing tenant context (403 Forbidden)', async () => {
    const session = new Session({
      id: 'ses_no_tenant_test_01',
      userId: 'usr_no_tenant_01',
      tokenHash: 'dummy_hash',
      scope: 'tenant',
      tenantId: null
    });
    await testEnv.sessionRepository.save(session);

    const user = new User({
      id: 'usr_no_tenant_01',
      email: 'notenant@example.com',
      passwordHash: 'dummy',
      status: UserStatus.ACTIVE,
      roles: ['END_USER'],
      scope: 'tenant',
      tenantId: null
    });
    await testEnv.userRepository.save(user);

    const tokenResult = JwtService.signAccessToken({
      userId: 'usr_no_tenant_01',
      sessionId: session.id,
      roles: ['END_USER'],
      scope: 'tenant',
      tenantId: null
    });

    const res = await fetch(`${testEnv.baseUrl}/api/v1/scans`, {
      headers: { 'Authorization': `Bearer ${tokenResult.token}` }
    });
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.strictEqual(data.error.code, 'FORBIDDEN');
    assert.strictEqual(data.error.message, 'Tenant context required');
  });

  it('HYG-008: SECURITY_ADMIN role grants security/asset permissions and denies platform/tenant-user administration', () => {
    const perms = RolePermissionPolicy.getPermissionsForRoles(['SECURITY_ADMIN']);

    // Allowing assertions
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'security:admin'), true);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'vulnerabilities:write'), true);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'assets:read'), true);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'assets:create'), true);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'assets:update'), true);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'assets:delete'), true);

    // Denying assertions
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'platform:admin'), false);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'platform:tenants:write'), false);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'tenant:users:write'), false);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'scans:cancel'), false);
    assert.strictEqual(RolePermissionPolicy.hasPermission(perms, 'findings:assign'), false);
  });

});
