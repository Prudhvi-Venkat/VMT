'use strict';

const crypto = require('crypto');

const FindingStatus = {
  OPEN: 'OPEN',
  TRIAGED: 'TRIAGED',
  IN_PROGRESS: 'IN_PROGRESS',
  MITIGATED: 'MITIGATED',
  RESOLVED: 'RESOLVED',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
  ACCEPTED_RISK: 'ACCEPTED_RISK'
};

const FindingSeverity = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  UNKNOWN: 'UNKNOWN'
};

// Statuses representing a finding that still requires remediation ("active").
const ACTIVE_FINDING_STATUSES = [
  FindingStatus.OPEN,
  FindingStatus.TRIAGED,
  FindingStatus.IN_PROGRESS
];

class ScanFinding {
  constructor({
    id,
    tenantId,
    scanId,
    projectId = null,
    assetId = null,
    componentId,
    vulnerabilityId,
    cveId,
    aliases = [],
    componentSnapshot = {},
    vulnerabilitySnapshot = {},
    versionEvidence = {},
    match = {},
    status = FindingStatus.OPEN,
    risk = {},
    sourceProvenance = {},
    remediation = null,
    assignedTo = null,
    assignedUserName = null,
    assignedAt = null,
    assignedBy = null,
    availableActions = [
      'VIEW_DETAILS',
      'ASSIGN',
      'CREATE_REMEDIATION',
      'MARK_FALSE_POSITIVE',
      'ACCEPT_RISK'
    ],
    createdAt = new Date(),
    updatedAt = new Date()
  }) {
    if (!tenantId || !scanId || !componentId || !vulnerabilityId) {
      throw new Error('ScanFinding requires tenantId, scanId, componentId, and vulnerabilityId');
    }

    this.id = id || `find_${crypto.randomUUID()}`;
    this.tenantId = tenantId;
    this.scanId = scanId;
    this.projectId = projectId || null;
    this.assetId = assetId || null;
    this.componentId = componentId;
    this.vulnerabilityId = vulnerabilityId;
    this.cveId = cveId || vulnerabilityId;
    this.aliases = aliases;
    this.componentSnapshot = {
      name: componentSnapshot.name || '',
      namespace: componentSnapshot.namespace || null,
      ecosystem: componentSnapshot.ecosystem || 'unknown',
      version: componentSnapshot.version || null,
      purl: componentSnapshot.purl || null
    };
    this.vulnerabilitySnapshot = {
      severity: vulnerabilitySnapshot.severity || FindingSeverity.UNKNOWN,
      cvssScore: vulnerabilitySnapshot.cvssScore !== undefined ? vulnerabilitySnapshot.cvssScore : null,
      cvssVector: vulnerabilitySnapshot.cvssVector || null,
      epss: vulnerabilitySnapshot.epss !== undefined ? vulnerabilitySnapshot.epss : null,
      cisaKev: Boolean(vulnerabilitySnapshot.cisaKev),
      cwes: vulnerabilitySnapshot.cwes || [],
      description: vulnerabilitySnapshot.description || '',
      references: vulnerabilitySnapshot.references || []
    };
    this.versionEvidence = {
      installedVersion: versionEvidence.installedVersion || this.componentSnapshot.version,
      affectedRule: versionEvidence.affectedRule || null,
      matchedRange: versionEvidence.matchedRange || null,
      fixedVersions: versionEvidence.fixedVersions || []
    };
    this.match = {
      method: match.method || 'UNKNOWN',
      confidence: match.confidence !== undefined ? match.confidence : 0.5,
      matchedIdentifier: match.matchedIdentifier || null
    };
    this.status = status;
    this.risk = {
      score: risk.score !== undefined ? risk.score : (this.vulnerabilitySnapshot.cvssScore || 0),
      severity: risk.severity || this.vulnerabilitySnapshot.severity,
      factors: risk.factors || {},
      policyId: risk.policyId || 'pol_global_default_risk',
      policyVersion: risk.policyVersion || '1.0.0',
      calculationVersion: risk.calculationVersion || '2.0.0',
      factorScores: risk.factorScores || {},
      explanation: risk.explanation || `Risk score of ${risk.score !== undefined ? risk.score : 0} calculated based on vulnerability severity and threat signals.`
    };
    this.sourceProvenance = {
      componentSource: sourceProvenance.componentSource || 'unknown',
      vulnerabilitySource: sourceProvenance.vulnerabilitySource || 'components_database',
      matchedRule: sourceProvenance.matchedRule || 'range',
      intelligenceUpdatedAt: sourceProvenance.intelligenceUpdatedAt || new Date()
    };
    this.remediation = remediation || {
      currentVersion: this.versionEvidence.installedVersion,
      fixedVersions: this.versionEvidence.fixedVersions,
      recommendedVersion: this.versionEvidence.fixedVersions[0] || null
    };
    this.assignedTo = assignedTo || null;
    this.assignedUserName = assignedUserName || null;
    this.assignedAt = assignedAt ? new Date(assignedAt) : null;
    this.assignedBy = assignedBy || null;
    this.availableActions = availableActions;
    this.createdAt = new Date(createdAt);
    this.updatedAt = new Date(updatedAt);
  }
}

module.exports = {
  ScanFinding,
  FindingStatus,
  FindingSeverity,
  ACTIVE_FINDING_STATUSES
};
