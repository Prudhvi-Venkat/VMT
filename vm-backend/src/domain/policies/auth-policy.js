'use strict';

const { UserStatus } = require('../entities/user.entity');

const AuthPolicy = {
  /**
   * Evaluates if account is permitted to attempt login
   */
  evaluateAccountStatus(user, now = new Date()) {
    if (!user) {
      return { allowed: false, reason: 'USER_NOT_FOUND' };
    }
    if (user.isLocked(now)) {
      return { allowed: false, reason: 'ACCOUNT_LOCKED', lockedUntil: user.lockedUntil };
    }
    if (user.status === UserStatus.DISABLED) {
      return { allowed: false, reason: 'USER_DISABLED' };
    }
    if (user.status === UserStatus.PENDING) {
      return { allowed: false, reason: 'USER_PENDING' };
    }
    if (user.status !== UserStatus.ACTIVE) {
      return { allowed: false, reason: 'USER_INACTIVE' };
    }
    return { allowed: true };
  },

  /**
   * Applies failed login logic. Returns updated user attributes.
   */
  handleFailedAttempt(user, maxAttempts, lockDurationMs, now = new Date()) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    let lockedUntil = user.lockedUntil;
    let status = user.status;
    let newlyLocked = false;

    if (attempts >= maxAttempts) {
      lockedUntil = new Date(now.getTime() + lockDurationMs);
      status = UserStatus.LOCKED;
      newlyLocked = true;
    }

    return {
      failedLoginAttempts: attempts,
      lockedUntil,
      status,
      lastFailedLoginAt: now,
      newlyLocked
    };
  },

  /**
   * Resets failed login counters upon successful authentication
   */
  handleSuccessfulLogin(now = new Date()) {
    return {
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: UserStatus.ACTIVE,
      lastLoginAt: now
    };
  }
};

module.exports = AuthPolicy;
