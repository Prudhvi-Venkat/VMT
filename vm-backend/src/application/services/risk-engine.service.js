'use strict';

const { RiskPolicy, defaultRiskPolicy } = require('../../domain/policies/risk-policy');
const { DomainEvent, eventBus, EVENT_TYPES } = require('../../events');

class RiskEngineService {
  constructor({ tenantRepository = null, assetRepository = null, eventBusInstance = eventBus } = {}) {
    this.tenantRepository = tenantRepository;
    this.assetRepository = assetRepository;
    this.eventBus = eventBusInstance;
    this.tenantPolicies = new Map(); // tenantId -> RiskPolicy
  }

  getPolicyForTenant(tenantId) {
    if (!tenantId) return defaultRiskPolicy;
    return this.tenantPolicies.get(tenantId) || defaultRiskPolicy;
  }

  setTenantPolicy(tenantId, policyConfig) {
    if (!tenantId) throw new Error('tenantId required');
    const policy = new RiskPolicy({
      id: `pol_tenant_${tenantId}`,
      version: policyConfig.version || '1.0.0',
      weights: policyConfig.weights,
      name: policyConfig.name || `Custom Risk Policy for Tenant ${tenantId}`
    });
    this.tenantPolicies.set(tenantId, policy);
    return policy;
  }

  /**
   * Evaluates contextual risk for a finding given vulnerability, asset, and tenant context
   */
  async evaluateFindingRisk({
    tenantId,
    vulnerabilitySnapshot = {},
    assetSnapshot = {},
    findingAgeDays = 0,
    correlationId = null
  } = {}) {
    const policy = this.getPolicyForTenant(tenantId);

    const assessment = policy.evaluate({
      cvssScore: vulnerabilitySnapshot.cvssScore,
      epss: vulnerabilitySnapshot.epss,
      cisaKev: vulnerabilitySnapshot.cisaKev,
      assetCriticality: assetSnapshot.criticality || 'UNKNOWN',
      environment: assetSnapshot.environment || 'UNKNOWN',
      findingAgeDays
    });

    return assessment;
  }

  /**
   * Recalculates risk for findings associated with an updated asset and emits domain events
   */
  async recalculateForAsset({ tenantId, asset, scanFindingRepository, correlationId }) {
    if (!scanFindingRepository || !asset) return;

    // Fetch findings for tenant
    const { items: findings } = await scanFindingRepository.findByTenant(tenantId, { limit: 1000 });
    const relatedFindings = findings.filter(f => f.assetId === asset.id || f.projectId === asset.projectId);

    for (const finding of relatedFindings) {
      const newAssessment = await this.evaluateFindingRisk({
        tenantId,
        vulnerabilitySnapshot: finding.vulnerabilitySnapshot,
        assetSnapshot: {
          criticality: asset.criticality,
          environment: asset.environment
        }
      });

      finding.risk = {
        score: newAssessment.score,
        severity: newAssessment.severity,
        policyId: newAssessment.policyId,
        policyVersion: newAssessment.policyVersion,
        calculationVersion: newAssessment.calculationVersion,
        factorScores: newAssessment.factorScores,
        factors: newAssessment.factors,
        explanation: newAssessment.explanation
      };

      if (this.eventBus) {
        await this.eventBus.publish(new DomainEvent({
          eventType: EVENT_TYPES.RISK_ASSESSMENT_UPDATED,
          tenantId,
          correlationId,
          payload: {
            findingId: finding.id,
            riskScore: newAssessment.score,
            severity: newAssessment.severity,
            policyId: newAssessment.policyId
          }
        }));
      }
    }
  }
}

module.exports = RiskEngineService;
