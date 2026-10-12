'use strict';

const EVENT_TYPES = Object.freeze({
  // Scan lifecycle
  SCAN_CREATED: 'scan.created',
  SCAN_STARTED: 'scan.started',
  SCAN_COMPLETED: 'scan.completed',
  SCAN_FAILED: 'scan.failed',

  // Finding lifecycle
  FINDING_CREATED: 'finding.created',
  FINDING_STATUS_CHANGED: 'finding.status_changed',
  FINDING_ASSIGNED: 'finding.assigned',
  FINDING_SEVERITY_OVERRIDDEN: 'finding.severity_overridden',

  // Asset lifecycle
  ASSET_CREATED: 'asset.created',
  ASSET_UPDATED: 'asset.updated',
  ASSET_DELETED: 'asset.deleted',

  // Tenant lifecycle
  TENANT_CREATED: 'tenant.created',
  TENANT_UPDATED: 'tenant.updated',
  TENANT_STATUS_CHANGED: 'tenant.status_changed',

  // User lifecycle
  USER_CREATED: 'user.created',
  USER_AUTHENTICATED: 'user.authenticated',
  USER_LOCKED: 'user.locked',

  // Risk calculation
  RISK_ASSESSMENT_UPDATED: 'risk.assessment.updated'
});

module.exports = EVENT_TYPES;
