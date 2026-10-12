'use strict';

require('./test-helper');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateRisk, riskBand, slaHours } = require('../lib/risk.ts');

describe('HYG-009: Risk Calculation & Posture Engine (lib/risk.ts)', () => {
  describe('riskBand', () => {
    it('categorizes scores correctly into bands according to policy', () => {
      assert.equal(riskBand(100), 'critical');
      assert.equal(riskBand(80), 'critical');
      assert.equal(riskBand(79), 'high');
      assert.equal(riskBand(60), 'high');
      assert.equal(riskBand(59), 'medium');
      assert.equal(riskBand(35), 'medium');
      assert.equal(riskBand(34), 'low');
      assert.equal(riskBand(1), 'low');
      assert.equal(riskBand(0), 'info');
      assert.equal(riskBand(-5), 'info');
    });
  });

  describe('slaHours', () => {
    it('returns strict remediation SLAs per enterprise policy', () => {
      assert.equal(slaHours('critical'), 1);
      assert.equal(slaHours('high'), 4);
      assert.equal(slaHours('medium'), 24);
      assert.equal(slaHours('low'), 72);
      assert.equal(slaHours('info'), 168);
    });
  });

  describe('calculateRisk', () => {
    it('calculates score with default factors when optional inputs are omitted', () => {
      const result = calculateRisk({});
      assert.ok(result);
      assert.equal(typeof result.score, 'number');
      assert.ok(result.score >= 0 && result.score <= 100);
      assert.ok(result.band);
      assert.ok(result.factors);
    });

    it('weighs critical factors: cvss=10, epss=1, exploit=kev, criticality=1, exposure=internet', () => {
      const result = calculateRisk({
        cvss: 10,
        epss: 1,
        exploit: 'kev',
        criticality: 1,
        exposure: 'internet'
      });
      // 10*5 (50) + 1*20 (20) + 15 (kev) + 10 (crit 1) + 5 (internet) = 100
      assert.equal(result.score, 100);
      assert.equal(result.band, 'critical');
      assert.equal(result.factors.cvss, 50);
      assert.equal(result.factors.epss, 20);
      assert.equal(result.factors.exploit, 15);
      assert.equal(result.factors.criticality, 10);
      assert.equal(result.factors.exposure, 5);
    });

    it('calculates low risk for minimal factors: cvss=2, exploit=none, exposure=air-gapped', () => {
      const result = calculateRisk({
        cvss: 2,
        epss: 0,
        exploit: 'none',
        criticality: 4,
        exposure: 'air-gapped'
      });
      // 2*5 (10) + 0 + 0 + 1 (crit 4) + 0 (air-gapped) = 11
      assert.equal(result.score, 11);
      assert.equal(result.band, 'low');
    });
  });
});
