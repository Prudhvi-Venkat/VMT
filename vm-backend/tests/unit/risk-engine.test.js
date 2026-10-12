'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { RiskPolicy, defaultRiskPolicy } = require('../../src/domain/policies/risk-policy');
const RiskEngineService = require('../../src/application/services/risk-engine.service');

describe('Contextual Risk Engine (ADR-008)', () => {
  it('should evaluate contextual risk with factor weights and generate explanation per AGENTS.md Rule 12', () => {
    const policy = new RiskPolicy();
    const assessment = policy.evaluate({
      cvssScore: 9.8,
      epss: 0.85,
      cisaKev: true,
      assetCriticality: 'TIER_1_CRITICAL',
      environment: 'PRODUCTION_INTERNET_FACING'
    });

    assert.ok(assessment.score >= 85);
    assert.equal(assessment.severity, 'CRITICAL');
    assert.equal(assessment.policyId, 'pol_global_default_risk');
    assert.equal(assessment.calculationVersion, '2.0.0');
    assert.ok(assessment.factorScores.cvss.contribution > 0);
    assert.ok(assessment.factorScores.cisaKev.contribution > 0);
    assert.ok(assessment.factorScores.assetCriticality.contribution > 0);
    assert.ok(assessment.explanation.includes('CRITICAL'));
    assert.ok(assessment.explanation.includes('CISA KEV'));
  });

  it('should compute lower contextual score for low CVSS in development environment', () => {
    const policy = new RiskPolicy();
    const assessment = policy.evaluate({
      cvssScore: 3.1,
      epss: 0.01,
      cisaKev: false,
      assetCriticality: 'TIER_4_LOW',
      environment: 'DEVELOPMENT'
    });

    assert.ok(assessment.score < 30);
    assert.ok(['LOW', 'INFO'].includes(assessment.severity));
  });

  it('should allow tenant-specific risk policy configuration in RiskEngineService', () => {
    const service = new RiskEngineService();
    const tenantPolicy = service.setTenantPolicy('tenant_finance', {
      weights: {
        cvss: 0.2,
        epss: 0.1,
        cisaKev: 0.3,
        assetCriticality: 0.3,
        environment: 0.1
      }
    });

    assert.equal(tenantPolicy.weights.assetCriticality, 0.3);
    const retrieved = service.getPolicyForTenant('tenant_finance');
    assert.equal(retrieved.id, 'pol_tenant_tenant_finance');
  });
});
