'use strict';

const DEFAULT_RISK_WEIGHTS = Object.freeze({
  cvss: 0.35,          // 35% Base vulnerability score
  epss: 0.20,          // 20% Exploit prediction score
  cisaKev: 0.20,       // 20% Known exploited vulnerability in the wild
  assetCriticality: 0.15, // 15% Asset importance
  environment: 0.10    // 10% Production vs staging exposure
});

const ASSET_CRITICALITY_MULTIPLIERS = Object.freeze({
  TIER_1_CRITICAL: 1.0,
  CRITICAL: 1.0,
  TIER_2_HIGH: 0.8,
  HIGH: 0.8,
  TIER_3_MEDIUM: 0.5,
  MEDIUM: 0.5,
  TIER_4_LOW: 0.2,
  LOW: 0.2,
  UNKNOWN: 0.4
});

const ENVIRONMENT_MULTIPLIERS = Object.freeze({
  PRODUCTION_INTERNET_FACING: 1.0,
  PRODUCTION: 0.8,
  STAGING: 0.4,
  DEVELOPMENT: 0.2,
  TEST: 0.1,
  UNKNOWN: 0.5
});

class RiskPolicy {
  constructor({
    id = 'pol_global_default_risk',
    version = '1.0.0',
    weights = DEFAULT_RISK_WEIGHTS,
    name = 'Global Default Risk Policy'
  } = {}) {
    this.id = id;
    this.version = version;
    this.name = name;
    this.weights = { ...DEFAULT_RISK_WEIGHTS, ...weights };
  }

  evaluate({
    cvssScore = 0,
    epss = 0,
    cisaKev = false,
    assetCriticality = 'UNKNOWN',
    environment = 'UNKNOWN',
    findingAgeDays = 0
  } = {}) {
    const normCvss = Math.max(0, Math.min(10, cvssScore || 0));
    const normEpss = Math.max(0, Math.min(1, epss || 0));
    const hasKev = Boolean(cisaKev);

    const critMultiplier = ASSET_CRITICALITY_MULTIPLIERS[String(assetCriticality).toUpperCase()] ?? 0.4;
    const envMultiplier = ENVIRONMENT_MULTIPLIERS[String(environment).toUpperCase()] ?? 0.5;

    // Component score calculations (0-100 normalized inputs)
    const cvssComponent = (normCvss / 10) * 100;
    const epssComponent = normEpss * 100;
    const kevComponent = hasKev ? 100 : 0;
    const critComponent = critMultiplier * 100;
    const envComponent = envMultiplier * 100;

    const factorBreakdown = {
      cvss: {
        rawValue: normCvss,
        weight: this.weights.cvss,
        contribution: Math.round(cvssComponent * this.weights.cvss * 100) / 100
      },
      epss: {
        rawValue: normEpss,
        weight: this.weights.epss,
        contribution: Math.round(epssComponent * this.weights.epss * 100) / 100
      },
      cisaKev: {
        rawValue: hasKev,
        weight: this.weights.cisaKev,
        contribution: Math.round(kevComponent * this.weights.cisaKev * 100) / 100
      },
      assetCriticality: {
        rawValue: assetCriticality,
        weight: this.weights.assetCriticality,
        contribution: Math.round(critComponent * this.weights.assetCriticality * 100) / 100
      },
      environment: {
        rawValue: environment,
        weight: this.weights.environment,
        contribution: Math.round(envComponent * this.weights.environment * 100) / 100
      }
    };

    // Calculate composite raw score (0-100 scale)
    const totalScore = Object.values(factorBreakdown).reduce((acc, f) => acc + f.contribution, 0);
    const score = Math.round(Math.max(0, Math.min(100, totalScore)));

    // Determine contextual severity band
    let severity = 'LOW';
    if (score >= 85) severity = 'CRITICAL';
    else if (score >= 65) severity = 'HIGH';
    else if (score >= 40) severity = 'MEDIUM';
    else if (score >= 15) severity = 'LOW';
    else severity = 'INFO';

    // Construct human-readable explanation per AGENTS.md Rule 12
    const reasons = [];
    if (normCvss >= 7.0) reasons.push(`CVSS base score of ${normCvss}`);
    if (hasKev) reasons.push('active in-the-wild exploitation cataloged by CISA KEV');
    if (normEpss >= 0.3) reasons.push(`high exploit probability (EPSS ${(normEpss * 100).toFixed(1)}%)`);
    if (critMultiplier >= 0.8) reasons.push(`high asset criticality (${assetCriticality})`);
    if (envMultiplier >= 0.8) reasons.push(`production environment exposure`);

    const explanation = reasons.length > 0
      ? `Assigned ${severity} contextual risk (${score}/100) driven by: ${reasons.join(', ')}.`
      : `Assigned ${severity} contextual risk (${score}/100) based on standard baseline scoring.`;

    return {
      score,
      severity,
      policyId: this.id,
      policyVersion: this.version,
      calculationVersion: '2.0.0',
      factorScores: factorBreakdown,
      factors: {
        cvss: factorBreakdown.cvss.contribution,
        epss: factorBreakdown.epss.contribution,
        exploit: factorBreakdown.cisaKev.contribution,
        criticality: factorBreakdown.assetCriticality.contribution,
        exposure: factorBreakdown.environment.contribution
      },
      explanation
    };
  }
}

const defaultRiskPolicy = new RiskPolicy();

module.exports = {
  RiskPolicy,
  defaultRiskPolicy,
  DEFAULT_RISK_WEIGHTS,
  ASSET_CRITICALITY_MULTIPLIERS,
  ENVIRONMENT_MULTIPLIERS
};
