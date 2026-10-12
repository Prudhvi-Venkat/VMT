'use strict';

const config = require('../../config');
const PasswordPolicy = require('../../domain/policies/password-policy');
const AuthPolicy = require('../../domain/policies/auth-policy');
const SessionPolicy = require('../../domain/policies/session-policy');
const { RolePermissionPolicy } = require('../../domain/policies/role-permission-policy');
const { Session, SessionStatus } = require('../../domain/entities/session.entity');
const { AuditActions } = require('../../domain/entities/audit-event.entity');
const TokenGenerator = require('../../infrastructure/security/token-generator');
const JwtService = require('../../infrastructure/security/jwt.service');

// User notification preferences: safe defaults applied when nothing is stored.
const DEFAULT_USER_PREFERENCES = {
  notifications: {
    emailOnCritical: true,
    emailOnScanComplete: true,
    emailOnSlaBreach: true
  }
};

const NOTIFICATION_PREFERENCE_KEYS = ['emailOnCritical', 'emailOnScanComplete', 'emailOnSlaBreach'];

class AuthService {
  constructor({ userRepository, sessionRepository, auditService, tenantRepository = null }) {
    this.userRepository = userRepository;
    this.sessionRepository = sessionRepository;
    this.auditService = auditService;
    this.tenantRepository = tenantRepository;
  }

  /**
   * Generates a composite refresh token: <sessionId>.<randomEntropy>
   */
  _buildRefreshToken(sessionId, secret) {
    return `${sessionId}.${secret}`;
  }

  /**
   * Parses composite refresh token into sessionId and secret
   */
  _parseRefreshToken(compositeToken) {
    if (!compositeToken || typeof compositeToken !== 'string') {
      return null;
    }
    const dotIndex = compositeToken.indexOf('.');
    if (dotIndex <= 0 || dotIndex === compositeToken.length - 1) {
      return null;
    }
    return {
      sessionId: compositeToken.substring(0, dotIndex),
      secret: compositeToken.substring(dotIndex + 1)
    };
  }

  /**
   * Use Case: User Login
   */
  async login({ email, password, tenantKey = null, ip = null, userAgent = null, correlationId = null }) {
    const actor = { ip, userAgent };

    // 1. Locate user
    const normalizedEmail = email ? email.toLowerCase().trim() : '';
    let user = null;
    let tenantDb = null;

    if (tenantKey) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        tenantDb = tenantDbManager.getTenantDb(tenantKey);
        const doc = await tenantDb.collection('users').findOne({ email: normalizedEmail });
        if (doc) user = new User(doc);
      } catch (e) {}
    }

    if (!user) {
      user = await this.userRepository.findByEmail(normalizedEmail);
    }

    if (!user) {
      // Check across active tenants if tenantKey was not specified
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        let activeTenants = [];
        if (tenantDbManager?.client) {
          try {
            const platformDb = tenantDbManager.getPlatformDb();
            activeTenants = await platformDb.collection('tenants').find({ status: 'ACTIVE' }).toArray();
          } catch (e) {}
        }
        if (activeTenants.length === 0 && this.tenantRepository && typeof this.tenantRepository.listAll === 'function') {
          const res = await this.tenantRepository.listAll({ status: 'ACTIVE' });
          activeTenants = res.items || [];
        }
        for (const t of activeTenants) {
          if (tenantDbManager?.client) {
            try {
              const tDb = tenantDbManager.getTenantDb(t.tenantKey);
              const doc = await tDb.collection('users').findOne({ email: normalizedEmail });
              if (doc) {
                user = new User(doc);
                tenantDb = tDb;
                break;
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
    }

    if (!user) {
      // Timing attack mitigation: execute dummy scrypt verification
      PasswordPolicy.dummyVerify(password || 'dummy');
      await this.auditService.recordEvent({
        actor,
        action: AuditActions.LOGIN_FAILURE,
        resource: { type: 'user', id: null },
        details: { reason: 'USER_NOT_FOUND', email: normalizedEmail },
        correlationId
      });
      const err = new Error('Invalid credentials');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    actor.userId = user.id;
    actor.roles = user.roles;

    // 1b. Verify tenant status for tenant-scoped users
    if (user.scope === 'tenant' && user.tenantId) {
      let tenantRecord = null;
      if (this.tenantRepository && typeof this.tenantRepository.findByKey === 'function') {
        try {
          tenantRecord = await this.tenantRepository.findByKey(user.tenantId);
        } catch (e) {}
      }
      if (!tenantRecord) {
        try {
          const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
          if (tenantDbManager?.client) {
            const platformDb = tenantDbManager.getPlatformDb();
            tenantRecord = await platformDb.collection('tenants').findOne({
              $or: [{ tenantKey: user.tenantId }, { id: user.tenantId }]
            });
          }
        } catch (e) {}
      }

      if (tenantRecord && tenantRecord.status && tenantRecord.status !== 'ACTIVE') {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.LOGIN_FAILURE,
          resource: { type: 'tenant', id: user.tenantId },
          details: { reason: 'TENANT_INACTIVE', status: tenantRecord.status },
          correlationId
        });
        const err = new Error(`Tenant account is ${tenantRecord.status.toLowerCase()}`);
        err.code = 'TENANT_INACTIVE';
        err.statusCode = 403;
        throw err;
      }
    }

    // 2. Evaluate Account Status
    const statusResult = AuthPolicy.evaluateAccountStatus(user);
    if (!statusResult.allowed) {
      if (statusResult.reason === 'ACCOUNT_LOCKED') {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.ACCOUNT_LOCKED,
          resource: { type: 'user', id: user.id },
          details: { reason: 'ACCOUNT_LOCKED', lockedUntil: statusResult.lockedUntil },
          correlationId
        });
      } else if (statusResult.reason === 'USER_DISABLED') {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.USER_DISABLED,
          resource: { type: 'user', id: user.id },
          details: { reason: 'USER_DISABLED' },
          correlationId
        });
      } else {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.LOGIN_FAILURE,
          resource: { type: 'user', id: user.id },
          details: { reason: statusResult.reason },
          correlationId
        });
      }

      // Generic failure response prevents account enumeration
      const err = new Error('Invalid credentials');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // 3. Verify Password
    const passwordValid = PasswordPolicy.verify(password, user.passwordHash);
    if (!passwordValid) {
      const failedResult = AuthPolicy.handleFailedAttempt(
        user,
        config.security.maxLoginAttempts,
        config.security.accountLockDurationMs
      );
      if (tenantDb) {
        await tenantDb.collection('users').updateOne({ id: user.id }, { $set: { ...failedResult, updatedAt: new Date() } });
      } else {
        await this.userRepository.update(user.id, failedResult);
      }

      await this.auditService.recordEvent({
        actor,
        action: AuditActions.LOGIN_FAILURE,
        resource: { type: 'user', id: user.id },
        details: {
          reason: 'INVALID_PASSWORD',
          attempts: failedResult.failedLoginAttempts,
          locked: failedResult.newlyLocked
        },
        correlationId
      });

      if (failedResult.newlyLocked) {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.ACCOUNT_LOCKED,
          resource: { type: 'user', id: user.id },
          details: { lockedUntil: failedResult.lockedUntil },
          correlationId
        });
      }

      const err = new Error('Invalid credentials');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // 4. Successful Password - Check Project Assignment for End Users
    // Tenant-wide roles (super admin, platform admin, security manager) are not bound to a single project.
    const isExemptAdmin = (user.roles || []).some(r => r === 'TENANT_SUPER_ADMIN' || r === 'PLATFORM_ADMIN' || r === 'SECURITY_MANAGER');
    if (user.scope === 'tenant' && !isExemptAdmin) {
      let hasProjects = false;
      if (Array.isArray(user.assignedProjectIds) && user.assignedProjectIds.length > 0) {
        hasProjects = true;
      }
      if (!hasProjects && tenantDb) {
        try {
          const memberDoc = await tenantDb.collection('project_members').findOne({ userId: user.id });
          if (memberDoc) hasProjects = true;
        } catch {}
      }

      if (!hasProjects) {
        await this.auditService.recordEvent({
          actor,
          action: AuditActions.LOGIN_FAILURE,
          resource: { type: 'user', id: user.id },
          details: { reason: 'NO_ASSIGNED_PROJECTS' },
          correlationId
        });
        const err = new Error('Access denied: You have not been assigned to any project in this organization. Please contact your tenant administrator.');
        err.code = 'NO_ASSIGNED_PROJECTS';
        err.statusCode = 403;
        throw err;
      }
    }

    // 5. Successful Login - Reset failed counters
    const successUpdates = AuthPolicy.handleSuccessfulLogin();
    if (tenantDb) {
      await tenantDb.collection('users').updateOne({ id: user.id }, { $set: { ...successUpdates, updatedAt: new Date() } });
    } else {
      await this.userRepository.update(user.id, successUpdates);
    }

    // 6. Create Session & Tokens
    const sessionId = TokenGenerator.generateId();
    const tokenFamilyId = TokenGenerator.generateId();
    const rawSecret = TokenGenerator.generateRefreshToken();
    const refreshTokenHash = SessionPolicy.hashRefreshToken(rawSecret);
    const refreshToken = this._buildRefreshToken(sessionId, rawSecret);

    const session = new Session({
      id: sessionId,
      userId: user.id,
      platformScope: user.scope,
      refreshTokenHash,
      tokenFamilyId,
      status: SessionStatus.ACTIVE,
      expiresAt: new Date(Date.now() + config.session.sessionTtlSeconds * 1000),
      ipMetadata: ip,
      userAgentMetadata: userAgent
    });

    await this.sessionRepository.save(session);

    if (tenantDb) {
      const doc = { ...session };
      delete doc._id;
      try {
        await tenantDb.collection('sessions').updateOne(
          { id: session.id },
          { $set: doc },
          { upsert: true }
        );
      } catch (e) {}
    }

    // 6. Sign Access Token
    const tokenResult = JwtService.signAccessToken({
      userId: user.id,
      sessionId,
      roles: user.roles,
      scope: user.scope,
      tenantId: user.tenantId
    });

    // 7. Audit Event
    await this.auditService.recordEvent({
      actor,
      action: AuditActions.LOGIN_SUCCESS,
      resource: { type: 'session', id: sessionId },
      details: { scope: user.scope },
      correlationId
    });

    return {
      accessToken: tokenResult.token,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenResult.expiresIn,
      user: user.toSafeObject()
    };
  }

  /**
   * Use Case: Refresh Token Rotation & Reuse Detection
   */
  async refresh({ refreshToken, ip = null, userAgent = null, correlationId = null }) {
    const actor = { ip, userAgent };

    if (!refreshToken) {
      const err = new Error('Refresh token is required');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    const parsed = this._parseRefreshToken(refreshToken);
    if (!parsed) {
      await this.auditService.recordEvent({
        actor,
        action: AuditActions.REFRESH_FAILURE,
        resource: { type: 'auth', id: null },
        details: { reason: 'MALFORMED_REFRESH_TOKEN' },
        correlationId
      });
      const err = new Error('Invalid refresh token');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 401;
      throw err;
    }

    const { sessionId, secret } = parsed;
    const session = await this.sessionRepository.findById(sessionId);

    if (!session) {
      await this.auditService.recordEvent({
        actor,
        action: AuditActions.REFRESH_FAILURE,
        resource: { type: 'session', id: sessionId },
        details: { reason: 'SESSION_NOT_FOUND' },
        correlationId
      });
      const err = new Error('Invalid refresh token');
      err.code = 'INVALID_REFRESH_TOKEN';
      err.statusCode = 401;
      throw err;
    }

    actor.userId = session.userId;
    let user = await this.userRepository.findById(session.userId);
    if (!user && (session.tenantId || session.platformScope === 'tenant')) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        if (session.tenantId) {
          const tenantDb = tenantDbManager.getTenantDb(session.tenantId);
          const doc = await tenantDb.collection('users').findOne({ id: session.userId });
          if (doc) user = new User(doc);
        }
      } catch (e) {}
    }
    const incomingHash = SessionPolicy.hashRefreshToken(secret);

    // Evaluate refresh policy
    const evaluation = SessionPolicy.evaluateRefresh(session, user, incomingHash);

    // Check for Token Reuse / Replay Attack
    if (evaluation.reuseDetected) {
      // Invalidate the entire token family / session immediately
      await this.sessionRepository.revokeByTokenFamilyId(
        session.tokenFamilyId,
        'TOKEN_REUSE_DETECTED'
      );
      if (session.tenantId || user?.tenantId) {
        try {
          const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
          const tDb = tenantDbManager.getTenantDb(session.tenantId || user?.tenantId);
          await tDb.collection('sessions').updateMany(
            { tokenFamilyId: session.tokenFamilyId },
            { $set: { status: SessionStatus.COMPROMISED, revokedAt: new Date(), revokeReason: 'TOKEN_REUSE_DETECTED' } }
          );
        } catch (e) {}
      }

      await this.auditService.recordEvent({
        actor,
        action: AuditActions.REFRESH_REUSE_DETECTED,
        resource: { type: 'session', id: sessionId },
        details: {
          tokenFamilyId: session.tokenFamilyId,
          reason: 'TOKEN_REUSE_DETECTED'
        },
        correlationId
      });

      const err = new Error('Suspicious token activity detected. Session invalidated.');
      err.code = 'REFRESH_TOKEN_REUSE_DETECTED';
      err.statusCode = 401;
      throw err;
    }

    if (!evaluation.valid) {
      await this.auditService.recordEvent({
        actor,
        action: AuditActions.REFRESH_FAILURE,
        resource: { type: 'session', id: sessionId },
        details: { reason: evaluation.reason },
        correlationId
      });

      const err = new Error('Invalid or expired refresh token');
      err.code = evaluation.reason;
      err.statusCode = 401;
      throw err;
    }

    // Atomic Token Rotation for Concurrency Safety (Section 30)
    const newSecret = TokenGenerator.generateRefreshToken();
    const newHash = SessionPolicy.hashRefreshToken(newSecret);
    const newRefreshToken = this._buildRefreshToken(sessionId, newSecret);

    const rotatedSession = await this.sessionRepository.atomicRotateRefreshToken(
      sessionId,
      incomingHash,
      newHash,
      new Date()
    );

    if (!rotatedSession) {
      // Another concurrent request rotated this token first or state changed
      await this.auditService.recordEvent({
        actor,
        action: AuditActions.REFRESH_FAILURE,
        resource: { type: 'session', id: sessionId },
        details: { reason: 'CONCURRENT_ROTATION_CONFLICT' },
        correlationId
      });
      const err = new Error('Token rotation conflict');
      err.code = 'ROTATION_CONFLICT';
      err.statusCode = 409;
      throw err;
    }

    if (user?.tenantId || session.tenantId) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const tDb = tenantDbManager.getTenantDb(user?.tenantId || session.tenantId);
        await tDb.collection('sessions').updateOne(
          { id: sessionId },
          { $set: { refreshTokenHash: newHash, lastUsedAt: new Date() } }
        );
      } catch (e) {}
    }

    // Issue New Access Token
    const tokenResult = JwtService.signAccessToken({
      userId: user.id,
      sessionId,
      roles: user.roles,
      scope: user.scope,
      tenantId: user.tenantId || session.tenantId || null
    });

    await this.auditService.recordEvent({
      actor,
      action: AuditActions.REFRESH_SUCCESS,
      resource: { type: 'session', id: sessionId },
      details: { scope: user.scope },
      correlationId
    });

    return {
      accessToken: tokenResult.token,
      refreshToken: newRefreshToken,
      tokenType: 'Bearer',
      expiresIn: tokenResult.expiresIn
    };
  }

  /**
   * Use Case: User Logout (Single Session)
   */
  async logout({ sessionId, userId, ip = null, userAgent = null, correlationId = null }) {
    const actor = { userId, ip, userAgent };

    if (sessionId) {
      const session = await this.sessionRepository.findById(sessionId);
      if (session && session.userId === userId) {
        await this.sessionRepository.update(sessionId, {
          status: SessionStatus.REVOKED,
          revokedAt: new Date(),
          revokeReason: 'LOGOUT'
        });
      }
    }

    await this.auditService.recordEvent({
      actor,
      action: AuditActions.LOGOUT,
      resource: { type: 'session', id: sessionId },
      details: { reason: 'USER_LOGOUT' },
      correlationId
    });

    return { success: true };
  }

  /**
   * Use Case: Logout All Sessions
   */
  async logoutAll({ userId, ip = null, userAgent = null, correlationId = null }) {
    const actor = { userId, ip, userAgent };

    await this.sessionRepository.revokeAllByUserId(userId, 'LOGOUT_ALL');

    await this.auditService.recordEvent({
      actor,
      action: AuditActions.LOGOUT_ALL,
      resource: { type: 'user', id: userId },
      details: { reason: 'LOGOUT_ALL_SESSIONS' },
      correlationId
    });

    return { success: true };
  }

  /**
   * Use Case: Get Authenticated Profile (/api/v1/auth/me)
   */
  async getMe({ principal, correlationId = null }) {
    if (!principal || !principal.userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      err.statusCode = 401;
      throw err;
    }

    const user = await this.userRepository.findById(principal.userId);
    if (!user || !user.isActive()) {
      const err = new Error('User inactive or not found');
      err.code = 'USER_INACTIVE';
      err.statusCode = 401;
      throw err;
    }

    return user.toSafeObject();
  }

  /**
   * Merges stored preferences over the defaults, then optional incoming
   * values over that. Only whitelisted notification flags are accepted;
   * non-boolean values are ignored.
   */
  _mergePreferences(stored, incoming) {
    const base = stored && typeof stored === 'object' ? stored : {};
    const extra = incoming && typeof incoming === 'object' ? incoming : {};
    const baseNotifications = base.notifications && typeof base.notifications === 'object' ? base.notifications : {};
    const extraNotifications = extra.notifications && typeof extra.notifications === 'object' ? extra.notifications : {};

    const notifications = { ...DEFAULT_USER_PREFERENCES.notifications, ...baseNotifications };
    for (const key of NOTIFICATION_PREFERENCE_KEYS) {
      if (typeof extraNotifications[key] === 'boolean') {
        notifications[key] = extraNotifications[key];
      }
    }

    // Only the whitelisted `notifications` block from the incoming payload is
    // applied; unknown top-level keys are dropped rather than persisted.
    return { ...DEFAULT_USER_PREFERENCES, ...base, notifications };
  }

  /**
   * Use Case: Read the authenticated user's preferences (/api/v1/auth/preferences)
   */
  async getPreferences({ principal, correlationId = null }) {
    if (!principal || !principal.userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      err.statusCode = 401;
      throw err;
    }

    const user = await this.userRepository.findById(principal.userId);
    if (!user || !user.isActive()) {
      const err = new Error('User inactive or not found');
      err.code = 'USER_INACTIVE';
      err.statusCode = 401;
      throw err;
    }

    return this._mergePreferences(user.preferences, null);
  }

  /**
   * Use Case: Persist the authenticated user's preferences (PUT /api/v1/auth/preferences)
   */
  async updatePreferences({ userId, preferences, correlationId = null }) {
    if (!userId) {
      const err = new Error('Unauthorized');
      err.code = 'UNAUTHORIZED';
      err.statusCode = 401;
      throw err;
    }

    if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      const err = new Error('Preferences payload must be an object');
      err.code = 'INVALID_REQUEST';
      err.statusCode = 400;
      throw err;
    }

    const user = await this.userRepository.findById(userId);
    if (!user || !user.isActive()) {
      const err = new Error('User inactive or not found');
      err.code = 'USER_INACTIVE';
      err.statusCode = 401;
      throw err;
    }

    const merged = this._mergePreferences(user.preferences, preferences);
    await this.userRepository.update(userId, { preferences: merged });

    await this.auditService.recordEvent({
      actor: { userId },
      action: AuditActions.USER_UPDATED || 'user.preferences_updated',
      resource: { type: 'user', id: userId },
      details: { reason: 'PREFERENCES_UPDATED' },
      correlationId
    });

    return merged;
  }

  /**
   * Use Case: Change Password
   */
  async changePassword({ userId, tenantKey = null, currentPassword, newPassword, correlationId = null }) {
    if (!userId || !currentPassword || !newPassword) {
      const err = new Error('User ID, current password, and new password are required');
      err.code = 'INVALID_REQUEST';
      err.statusCode = 400;
      throw err;
    }

    let user = null;
    let tenantDb = null;

    if (tenantKey) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        tenantDb = tenantDbManager.getTenantDb(tenantKey);
        const doc = await tenantDb.collection('users').findOne({ id: userId });
        if (doc) user = new User(doc);
      } catch (e) {}
    }

    if (!user) {
      user = await this.userRepository.findById(userId);
    }

    if (!user) {
      const err = new Error('User not found');
      err.code = 'USER_NOT_FOUND';
      err.statusCode = 404;
      throw err;
    }

    // Verify current password
    const isValid = PasswordPolicy.verify(currentPassword, user.passwordHash);
    if (!isValid) {
      const err = new Error('Current password is incorrect');
      err.code = 'INVALID_CREDENTIALS';
      err.statusCode = 401;
      throw err;
    }

    // Validate new password complexity
    const complexity = PasswordPolicy.validateComplexity(newPassword);
    if (!complexity.isValid) {
      const err = new Error(complexity.errors.join('; '));
      err.code = 'PASSWORD_COMPLEXITY_FAILED';
      err.statusCode = 422;
      throw err;
    }

    // Hash and persist new password
    const newHash = PasswordPolicy.hash(newPassword);
    user.passwordHash = newHash;
    user.updatedAt = new Date();
    user.mustChangePassword = false;

    if (tenantDb) {
      await tenantDb.collection('users').updateOne(
        { id: userId },
        { $set: { passwordHash: newHash, mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() } }
      );
    } else {
      await this.userRepository.save(user);
    }

    // Revoke previous sessions
    await this.sessionRepository.revokeAllByUserId(userId, 'PASSWORD_CHANGE');

    await this.auditService.recordEvent({
      actor: { userId },
      action: AuditActions.USER_UPDATED || 'user.password_changed',
      resource: { type: 'user', id: userId },
      details: { reason: 'PASSWORD_CHANGED' },
      correlationId
    });

    return { success: true, message: 'Password updated successfully' };
  }

  /**
   * Use Case: Forgot Password (Dispatch reset token)
   */
  async forgotPassword({ email, tenantKey = null, correlationId = null }) {
    if (!email) {
      return { success: true, message: 'If the account exists, a password reset token has been dispatched.' };
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user = null;
    let tenantDb = null;

    if (tenantKey) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        tenantDb = tenantDbManager.getTenantDb(tenantKey);
        const doc = await tenantDb.collection('users').findOne({ email: normalizedEmail });
        if (doc) user = new User(doc);
      } catch (e) {}
    }

    if (!user) {
      user = await this.userRepository.findByEmail(normalizedEmail);
    }

    if (user && user.isActive()) {
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      if (tenantDb) {
        await tenantDb.collection('users').updateOne(
          { id: user.id },
          { $set: { resetPasswordToken: resetTokenHash, resetPasswordExpires: resetExpires } }
        );
      } else {
        user.resetPasswordToken = resetTokenHash;
        user.resetPasswordExpires = resetExpires;
        await this.userRepository.save(user);
      }

      await this.auditService.recordEvent({
        actor: { userId: user.id },
        action: 'auth.password.reset_requested',
        resource: { type: 'user', id: user.id },
        details: { email: normalizedEmail },
        correlationId
      });
    }

    // Always return neutral message for timing attack and enumeration prevention
    return { success: true, message: 'If the account exists, a password reset token has been dispatched.' };
  }

  /**
   * Use Case: Reset Password (Using Token)
   */
  async resetPassword({ token, newPassword, tenantKey = null, correlationId = null }) {
    if (!token || !newPassword) {
      const err = new Error('Reset token and new password are required');
      err.code = 'INVALID_REQUEST';
      err.statusCode = 400;
      throw err;
    }

    const crypto = require('crypto');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    let user = null;
    let tenantDb = null;

    if (tenantKey) {
      try {
        const { tenantDbManager } = require('../../infrastructure/database/tenant-database-manager');
        const { User } = require('../../domain/entities/user.entity');
        tenantDb = tenantDbManager.getTenantDb(tenantKey);
        const doc = await tenantDb.collection('users').findOne({
          resetPasswordToken: tokenHash,
          resetPasswordExpires: { $gt: new Date() }
        });
        if (doc) user = new User(doc);
      } catch (e) {}
    }

    if (!user && this.userRepository.findByResetToken) {
      user = await this.userRepository.findByResetToken(tokenHash);
    }

    if (!user) {
      const err = new Error('Invalid or expired password reset token');
      err.code = 'INVALID_RESET_TOKEN';
      err.statusCode = 400;
      throw err;
    }

    // Validate new password complexity
    const complexity = PasswordPolicy.validateComplexity(newPassword);
    if (!complexity.isValid) {
      const err = new Error(complexity.errors.join('; '));
      err.code = 'PASSWORD_COMPLEXITY_FAILED';
      err.statusCode = 422;
      throw err;
    }

    const newHash = PasswordPolicy.hash(newPassword);
    user.passwordHash = newHash;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.updatedAt = new Date();

    if (tenantDb) {
      await tenantDb.collection('users').updateOne(
        { id: user.id },
        { 
          $set: { passwordHash: newHash, updatedAt: new Date() },
          $unset: { resetPasswordToken: '', resetPasswordExpires: '' }
        }
      );
    } else {
      await this.userRepository.save(user);
    }

    // Revoke all sessions
    await this.sessionRepository.revokeAllByUserId(user.id, 'PASSWORD_RESET');

    await this.auditService.recordEvent({
      actor: { userId: user.id },
      action: 'auth.password.reset_completed',
      resource: { type: 'user', id: user.id },
      details: { reason: 'PASSWORD_RESET_SUCCESSFUL' },
      correlationId
    });

    return { success: true, message: 'Password has been reset successfully. Please log in with your new credentials.' };
  }
}

module.exports = AuthService;
