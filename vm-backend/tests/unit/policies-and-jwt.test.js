'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');

const PasswordPolicy = require('../../src/domain/policies/password-policy');
const JwtService = require('../../src/infrastructure/security/jwt.service');
const { RolePermissionPolicy } = require('../../src/domain/policies/role-permission-policy');
const SessionPolicy = require('../../src/domain/policies/session-policy');
const AuthPolicy = require('../../src/domain/policies/auth-policy');
const { User, UserStatus } = require('../../src/domain/entities/user.entity');
const { Session, SessionStatus } = require('../../src/domain/entities/session.entity');
const { AuthenticatedPrincipal } = require('../../src/domain/entities/principal.entity');

describe('Unit Tests: Domain Policies & Security Services', () => {

  describe('PasswordPolicy', () => {
    it('should hash passwords with scrypt and unique salts', () => {
      const hash1 = PasswordPolicy.hash('SecretP@ssw0rd!');
      const hash2 = PasswordPolicy.hash('SecretP@ssw0rd!');
      assert.ok(hash1.startsWith('scrypt$'));
      assert.ok(hash2.startsWith('scrypt$'));
      assert.notStrictEqual(hash1, hash2, 'Salts must be unique');
    });

    it('should verify valid password correctly', () => {
      const hash = PasswordPolicy.hash('ValidPassword123!');
      assert.strictEqual(PasswordPolicy.verify('ValidPassword123!', hash), true);
      assert.strictEqual(PasswordPolicy.verify('WrongPassword', hash), false);
    });

    it('should run dummyVerify safely', () => {
      const result = PasswordPolicy.dummyVerify('any_password');
      assert.strictEqual(result, false);
    });

    it('should validate password complexity correctly', () => {
      const valid = PasswordPolicy.validateComplexity('StrongP@ss123');
      assert.strictEqual(valid.isValid, true);
      assert.strictEqual(valid.errors.length, 0);

      const tooShort = PasswordPolicy.validateComplexity('Sh0rt!');
      assert.strictEqual(tooShort.isValid, false);
      assert.ok(tooShort.errors.some(e => e.includes('8 characters')));

      const noUpper = PasswordPolicy.validateComplexity('lowercase123!');
      assert.strictEqual(noUpper.isValid, false);
      assert.ok(noUpper.errors.some(e => e.includes('uppercase')));

      const noLower = PasswordPolicy.validateComplexity('UPPERCASE123!');
      assert.strictEqual(noLower.isValid, false);
      assert.ok(noLower.errors.some(e => e.includes('lowercase')));

      const noNumber = PasswordPolicy.validateComplexity('NoNumbersHere!');
      assert.strictEqual(noNumber.isValid, false);
      assert.ok(noNumber.errors.some(e => e.includes('number')));

      const noSpecial = PasswordPolicy.validateComplexity('NoSpecial1234');
      assert.strictEqual(noSpecial.isValid, false);
      assert.ok(noSpecial.errors.some(e => e.includes('special character')));

      const empty = PasswordPolicy.validateComplexity('');
      assert.strictEqual(empty.isValid, false);
    });
  });

  describe('JwtService', () => {
    it('should sign and verify valid access tokens', () => {
      const tokenResult = JwtService.signAccessToken({
        userId: 'usr_123',
        sessionId: 'ses_456',
        roles: ['PLATFORM_ADMIN'],
        scope: 'platform'
      });

      assert.ok(tokenResult.token);
      assert.strictEqual(typeof tokenResult.expiresIn, 'number');

      const verification = JwtService.verifyAccessToken(tokenResult.token);
      assert.strictEqual(verification.valid, true);
      assert.strictEqual(verification.payload.sub, 'usr_123');
      assert.strictEqual(verification.payload.sid, 'ses_456');
      assert.deepStrictEqual(verification.payload.roles, ['PLATFORM_ADMIN']);
      assert.strictEqual(verification.payload.scope, 'platform');
      assert.strictEqual(verification.payload.type, 'access');
    });

    it('should reject tampered JWT signatures', () => {
      const tokenResult = JwtService.signAccessToken({
        userId: 'usr_123',
        sessionId: 'ses_456',
        roles: ['PLATFORM_ADMIN']
      });

      const parts = tokenResult.token.split('.');
      const tampered = `${parts[0]}.${parts[1]}.invalidsignature`;
      const verification = JwtService.verifyAccessToken(tampered);
      assert.strictEqual(verification.valid, false);
      assert.strictEqual(verification.error, 'INVALID_SIGNATURE');
    });

    it('should reject tokens with missing claims or malformed format', () => {
      assert.strictEqual(JwtService.verifyAccessToken('invalid.token').valid, false);
      assert.strictEqual(JwtService.verifyAccessToken('').valid, false);
      assert.strictEqual(JwtService.verifyAccessToken(null).valid, false);
    });
  });

  describe('RolePermissionPolicy', () => {
    it('should map PLATFORM_ADMIN to platform administration permissions', () => {
      const permissions = RolePermissionPolicy.getPermissionsForRoles(['PLATFORM_ADMIN']);
      assert.ok(permissions.includes('platform:admin'));
      assert.ok(permissions.includes('users:read'));
      assert.ok(permissions.includes('sessions:revoke'));
    });

    it('should map SECURITY_MANAGER to tenant-wide read + remediation without management rights', () => {
      const permissions = RolePermissionPolicy.getPermissionsForRoles(['SECURITY_MANAGER']);
      const expected = [
        'tenant:projects:read',
        'assets:read', 'assets:create', 'assets:update', 'assets:delete',
        'scans:read', 'scans:create', 'scans:cancel',
        'sbom:upload', 'sbom:review',
        'findings:read', 'findings:update', 'findings:comment',
        'findings:assign', 'findings:resolve', 'findings:close', 'findings:reopen',
        'audit:read'
      ];
      for (const perm of expected) {
        assert.ok(permissions.includes(perm), `SECURITY_MANAGER should include ${perm}`);
      }
      assert.ok(!permissions.includes('tenant:users:read'), 'SECURITY_MANAGER must not read users');
      assert.ok(!permissions.includes('tenant:users:write'), 'SECURITY_MANAGER must not manage users');
      assert.ok(!permissions.includes('tenant:projects:write'), 'SECURITY_MANAGER must not manage projects');
      assert.ok(!permissions.includes('integrations:manage'), 'SECURITY_MANAGER must not manage integrations');
      assert.ok(!permissions.includes('*'), 'SECURITY_MANAGER must not receive wildcard permissions');
    });

    it('should allow wildcard and exact permission checks', () => {
      assert.strictEqual(RolePermissionPolicy.hasPermission(['platform:admin'], 'platform:admin'), true);
      assert.strictEqual(RolePermissionPolicy.hasPermission(['platform:admin'], 'nonexistent:perm'), false);
      assert.strictEqual(RolePermissionPolicy.hasPermission(['*'], 'any:perm'), true);
    });

    it('should validate platform scope for PLATFORM_ADMIN only', () => {
      const adminPrincipal = new AuthenticatedPrincipal({
        userId: 'u1',
        sessionId: 's1',
        scope: 'platform',
        roles: ['PLATFORM_ADMIN']
      });
      assert.strictEqual(RolePermissionPolicy.validatePlatformScope(adminPrincipal), true);

      const tenantPrincipal = new AuthenticatedPrincipal({
        userId: 'u2',
        sessionId: 's2',
        scope: 'tenant',
        roles: ['TENANT_ADMIN']
      });
      assert.strictEqual(RolePermissionPolicy.validatePlatformScope(tenantPrincipal), false);
    });
  });

  describe('SessionPolicy', () => {
    it('should hash refresh tokens using SHA-256', () => {
      const hash1 = SessionPolicy.hashRefreshToken('token123');
      const hash2 = SessionPolicy.hashRefreshToken('token123');
      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64);
    });

    it('should detect refresh token reuse when presented hash does not match current session hash', () => {
      const currentSecret = 'current_active_secret';
      const oldSecret = 'previously_rotated_secret';
      const session = new Session({
        id: 's1',
        userId: 'u1',
        refreshTokenHash: SessionPolicy.hashRefreshToken(currentSecret),
        tokenFamilyId: 'fam1',
        status: SessionStatus.ACTIVE
      });
      const user = new User({ id: 'u1', status: UserStatus.ACTIVE });

      const oldHash = SessionPolicy.hashRefreshToken(oldSecret);
      const evalResult = SessionPolicy.evaluateRefresh(session, user, oldHash);
      assert.strictEqual(evalResult.valid, false);
      assert.strictEqual(evalResult.reuseDetected, true);
      assert.strictEqual(evalResult.reason, 'REFRESH_TOKEN_REUSE_DETECTED');
    });

    it('should approve valid refresh token for active session', () => {
      const secret = 'valid_secret';
      const session = new Session({
        id: 's1',
        userId: 'u1',
        refreshTokenHash: SessionPolicy.hashRefreshToken(secret),
        tokenFamilyId: 'fam1',
        status: SessionStatus.ACTIVE
      });
      const user = new User({ id: 'u1', status: UserStatus.ACTIVE });

      const hash = SessionPolicy.hashRefreshToken(secret);
      const evalResult = SessionPolicy.evaluateRefresh(session, user, hash);
      assert.strictEqual(evalResult.valid, true);
    });
  });

  describe('AuthPolicy', () => {
    it('should evaluate account states correctly', () => {
      const activeUser = new User({ id: 'u1', status: UserStatus.ACTIVE });
      assert.strictEqual(AuthPolicy.evaluateAccountStatus(activeUser).allowed, true);

      const disabledUser = new User({ id: 'u2', status: UserStatus.DISABLED });
      assert.strictEqual(AuthPolicy.evaluateAccountStatus(disabledUser).allowed, false);

      const lockedUser = new User({
        id: 'u3',
        status: UserStatus.LOCKED,
        lockedUntil: new Date(Date.now() + 60000)
      });
      assert.strictEqual(AuthPolicy.evaluateAccountStatus(lockedUser).allowed, false);
    });

    it('should increment attempts and lock account upon reaching maxAttempts', () => {
      const user = new User({ id: 'u1', status: UserStatus.ACTIVE, failedLoginAttempts: 4 });
      const result = AuthPolicy.handleFailedAttempt(user, 5, 900000);
      assert.strictEqual(result.failedLoginAttempts, 5);
      assert.strictEqual(result.newlyLocked, true);
      assert.strictEqual(result.status, UserStatus.LOCKED);
      assert.ok(result.lockedUntil > new Date());
    });
  });

});
