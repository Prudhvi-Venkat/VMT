'use strict';

const { FindingStatus, FindingSeverity } = require('../entities/scan-finding.entity');

const ALLOWED_TRANSITIONS = Object.freeze({
  [FindingStatus.OPEN]: [
    FindingStatus.TRIAGED,
    FindingStatus.IN_PROGRESS,
    FindingStatus.FALSE_POSITIVE,
    FindingStatus.ACCEPTED_RISK,
    FindingStatus.RESOLVED
  ],
  [FindingStatus.TRIAGED]: [
    FindingStatus.IN_PROGRESS,
    FindingStatus.FALSE_POSITIVE,
    FindingStatus.ACCEPTED_RISK,
    FindingStatus.RESOLVED
  ],
  [FindingStatus.IN_PROGRESS]: [
    FindingStatus.MITIGATED,
    FindingStatus.RESOLVED,
    FindingStatus.ACCEPTED_RISK,
    FindingStatus.FALSE_POSITIVE
  ],
  [FindingStatus.MITIGATED]: [
    FindingStatus.RESOLVED,
    FindingStatus.REOPENED || 'REOPENED',
    FindingStatus.IN_PROGRESS
  ],
  [FindingStatus.RESOLVED]: [
    'REOPENED',
    FindingStatus.OPEN
  ],
  [FindingStatus.FALSE_POSITIVE]: [
    'REOPENED',
    FindingStatus.OPEN
  ],
  [FindingStatus.ACCEPTED_RISK]: [
    'REOPENED',
    FindingStatus.OPEN
  ],
  REOPENED: [
    FindingStatus.TRIAGED,
    FindingStatus.IN_PROGRESS,
    FindingStatus.RESOLVED,
    FindingStatus.FALSE_POSITIVE,
    FindingStatus.ACCEPTED_RISK
  ]
});

// SLA remediation targets in days
const SLA_DAYS_BY_SEVERITY = Object.freeze({
  [FindingSeverity.CRITICAL]: 7,
  [FindingSeverity.HIGH]: 14,
  [FindingSeverity.MEDIUM]: 30,
  [FindingSeverity.LOW]: 60,
  [FindingSeverity.UNKNOWN]: 90
});

class FindingLifecyclePolicy {
  static getValidStatuses() {
    return [
      ...Object.values(FindingStatus),
      'REOPENED'
    ];
  }

  static canTransition(currentStatus, targetStatus) {
    const current = (currentStatus || FindingStatus.OPEN).toUpperCase();
    const target = (targetStatus || '').toUpperCase();

    if (current === target) return true;

    const allowed = ALLOWED_TRANSITIONS[current];
    if (!allowed) return false;

    return allowed.includes(target);
  }

  static validateTransition(currentStatus, targetStatus, { reason, actorRoles = [], expiresAt } = {}) {
    const current = (currentStatus || FindingStatus.OPEN).toUpperCase();
    const target = (targetStatus || '').toUpperCase();

    const validStatuses = this.getValidStatuses();
    if (!validStatuses.includes(target)) {
      const err = new Error(`Invalid target status '${target}'. Valid statuses: ${validStatuses.join(', ')}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS';
      throw err;
    }

    if (!this.canTransition(current, target)) {
      const allowed = ALLOWED_TRANSITIONS[current] || [];
      const err = new Error(`Cannot transition finding from '${current}' to '${target}'. Allowed transitions: ${allowed.join(', ') || 'none'}`);
      err.statusCode = 400;
      err.code = 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    if (target === FindingStatus.ACCEPTED_RISK && (!reason || reason.trim().length === 0)) {
      const err = new Error('Accepting risk requires a documented justification reason');
      err.statusCode = 400;
      err.code = 'JUSTIFICATION_REQUIRED';
      throw err;
    }

    if (target === FindingStatus.FALSE_POSITIVE && (!reason || reason.trim().length === 0)) {
      const err = new Error('Marking as false positive requires a documented justification reason');
      err.statusCode = 400;
      err.code = 'JUSTIFICATION_REQUIRED';
      throw err;
    }

    return true;
  }

  static calculateSlaDeadline(severity, fromDate = new Date()) {
    const normalizedSev = (severity || FindingSeverity.UNKNOWN).toUpperCase();
    const days = SLA_DAYS_BY_SEVERITY[normalizedSev] || 90;
    const deadline = new Date(fromDate);
    deadline.setDate(deadline.getDate() + days);
    return deadline;
  }

  static isOverdue(finding, asOfDate = new Date()) {
    if (!finding) return false;
    const terminalStatuses = [FindingStatus.RESOLVED, FindingStatus.FALSE_POSITIVE, FindingStatus.ACCEPTED_RISK];
    if (terminalStatuses.includes(finding.status)) {
      return false;
    }
    const createdAt = finding.createdAt ? new Date(finding.createdAt) : new Date();
    const severity = finding.vulnerabilitySnapshot?.severity || finding.risk?.severity;
    const deadline = this.calculateSlaDeadline(severity, createdAt);
    return new Date(asOfDate) > deadline;
  }

  static getAvailableNextStatuses(currentStatus) {
    const current = (currentStatus || FindingStatus.OPEN).toUpperCase();
    return ALLOWED_TRANSITIONS[current] || [];
  }
}

module.exports = {
  FindingLifecyclePolicy,
  ALLOWED_TRANSITIONS,
  SLA_DAYS_BY_SEVERITY
};
