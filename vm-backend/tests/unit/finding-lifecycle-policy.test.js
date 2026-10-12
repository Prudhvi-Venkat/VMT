'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FindingLifecyclePolicy, ALLOWED_TRANSITIONS } = require('../../src/domain/policies/finding-lifecycle-policy');
const { FindingStatus, FindingSeverity } = require('../../src/domain/entities/scan-finding.entity');

describe('Finding Lifecycle Policy & State Machine (ADR-007)', () => {
  it('should allow valid transitions from OPEN', () => {
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.OPEN, FindingStatus.TRIAGED), true);
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.OPEN, FindingStatus.IN_PROGRESS), true);
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.OPEN, FindingStatus.FALSE_POSITIVE), true);
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.OPEN, FindingStatus.ACCEPTED_RISK), true);
  });

  it('should disallow invalid jumps (e.g. RESOLVED -> IN_PROGRESS directly)', () => {
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.RESOLVED, FindingStatus.IN_PROGRESS), false);
    assert.equal(FindingLifecyclePolicy.canTransition(FindingStatus.RESOLVED, FindingStatus.TRIAGED), false);
  });

  it('should require justification reason when marking ACCEPTED_RISK or FALSE_POSITIVE', () => {
    assert.throws(() => {
      FindingLifecyclePolicy.validateTransition(FindingStatus.OPEN, FindingStatus.ACCEPTED_RISK, { reason: '' });
    }, /Accepting risk requires a documented justification reason/);

    assert.throws(() => {
      FindingLifecyclePolicy.validateTransition(FindingStatus.OPEN, FindingStatus.FALSE_POSITIVE, { reason: '   ' });
    }, /Marking as false positive requires a documented justification reason/);

    assert.doesNotThrow(() => {
      FindingLifecyclePolicy.validateTransition(FindingStatus.OPEN, FindingStatus.ACCEPTED_RISK, {
        reason: 'Compensating WAF rule deployed on edge gateway'
      });
    });
  });

  it('should calculate SLA deadlines based on normalized severity', () => {
    const baseDate = new Date('2026-01-01T00:00:00.000Z');

    const critDeadline = FindingLifecyclePolicy.calculateSlaDeadline(FindingSeverity.CRITICAL, baseDate);
    const highDeadline = FindingLifecyclePolicy.calculateSlaDeadline(FindingSeverity.HIGH, baseDate);
    const medDeadline = FindingLifecyclePolicy.calculateSlaDeadline(FindingSeverity.MEDIUM, baseDate);

    // CRITICAL: 7 days
    assert.equal(critDeadline.toISOString(), '2026-01-08T00:00:00.000Z');
    // HIGH: 14 days
    assert.equal(highDeadline.toISOString(), '2026-01-15T00:00:00.000Z');
    // MEDIUM: 30 days
    assert.equal(medDeadline.toISOString(), '2026-01-31T00:00:00.000Z');
  });

  it('should detect overdue findings accurately', () => {
    const oldFinding = {
      status: FindingStatus.OPEN,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      vulnerabilitySnapshot: { severity: FindingSeverity.CRITICAL }
    };

    const resolvedOldFinding = {
      status: FindingStatus.RESOLVED,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      vulnerabilitySnapshot: { severity: FindingSeverity.CRITICAL }
    };

    const checkDate = new Date('2026-01-20T00:00:00.000Z');
    assert.equal(FindingLifecyclePolicy.isOverdue(oldFinding, checkDate), true);
    assert.equal(FindingLifecyclePolicy.isOverdue(resolvedOldFinding, checkDate), false);
  });
});
