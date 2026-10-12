'use strict';

/**
 * User Account Statuses per specification:
 * ACTIVE, DISABLED, LOCKED, PENDING
 */
const UserStatus = {
  ACTIVE: 'ACTIVE',
  DISABLED: 'DISABLED',
  LOCKED: 'LOCKED',
  PENDING: 'PENDING'
};

class User {
  constructor({
    id,
    email,
    passwordHash,
    status = UserStatus.PENDING,
    roles = [],
    scope = 'platform',
    tenantId = null,
    firstName = '',
    lastName = '',
    title = '',
    employeeId = '',
    department = '',
    assignedProjectIds = [],
    failedLoginAttempts = 0,
    lockedUntil = null,
    lastLoginAt = null,
    lastFailedLoginAt = null,
    passwordChangedAt = null,
    mustChangePassword = false,
    preferences = {},
    createdAt = new Date(),
    updatedAt = new Date(),
    securityMetadata = {}
  }) {
    this.id = id;
    this.email = email ? email.toLowerCase().trim() : '';
    this.passwordHash = passwordHash;
    this.status = status;
    this.roles = Array.isArray(roles) ? roles : [roles];
    this.scope = scope;
    this.tenantId = tenantId;
    this.firstName = firstName || securityMetadata.firstName || '';
    this.lastName = lastName || securityMetadata.lastName || '';
    this.name = securityMetadata.name || `${this.firstName} ${this.lastName}`.trim() || this.email.split('@')[0];
    this.title = title || securityMetadata.title || '';
    this.employeeId = employeeId || securityMetadata.employeeId || '';
    this.department = department || securityMetadata.department || '';
    this.assignedProjectIds = Array.isArray(assignedProjectIds) ? assignedProjectIds : [];
    this.failedLoginAttempts = failedLoginAttempts || 0;
    this.lockedUntil = lockedUntil ? new Date(lockedUntil) : null;
    this.lastLoginAt = lastLoginAt ? new Date(lastLoginAt) : null;
    this.lastFailedLoginAt = lastFailedLoginAt ? new Date(lastFailedLoginAt) : null;
    this.passwordChangedAt = passwordChangedAt ? new Date(passwordChangedAt) : null;
    this.mustChangePassword = Boolean(mustChangePassword);
    this.preferences = preferences && typeof preferences === 'object' ? preferences : {};
    this.createdAt = createdAt ? new Date(createdAt) : new Date();
    this.updatedAt = updatedAt ? new Date(updatedAt) : new Date();
    this.securityMetadata = {
      ...securityMetadata,
      name: this.name,
      firstName: this.firstName,
      lastName: this.lastName,
      title: this.title,
      employeeId: this.employeeId,
      department: this.department,
      assignedProjectIds: this.assignedProjectIds
    };
  }

  isLocked(now = new Date()) {
    if (this.status === UserStatus.LOCKED) {
      if (this.lockedUntil && this.lockedUntil > now) {
        return true;
      }
      return false; // Lock expired
    }
    if (this.lockedUntil && this.lockedUntil > now) {
      return true;
    }
    return false;
  }

  isActive(now = new Date()) {
    if (this.isLocked(now)) {
      return false;
    }
    return this.status === UserStatus.ACTIVE;
  }

  canAuthenticate(now = new Date()) {
    return this.isActive(now);
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  toSafeObject() {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      firstName: this.firstName,
      lastName: this.lastName,
      title: this.title,
      employeeId: this.employeeId,
      department: this.department,
      assignedProjectIds: this.assignedProjectIds,
      roles: [...this.roles],
      status: this.status,
      scope: this.scope,
      tenantId: this.tenantId || null,
      createdAt: this.createdAt,
      lastLoginAt: this.lastLoginAt,
      mustChangePassword: this.mustChangePassword
    };
  }
}

module.exports = {
  User,
  UserStatus
};
