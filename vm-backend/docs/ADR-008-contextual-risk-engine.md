# ADR-008: Contextual Multi-Factor Risk Scoring Engine

## Decision

The platform replaces raw CVSS score passthrough with a multi-factor, policy-governed Contextual Risk Engine adhering to Constitution Rule 12: *"Risk decisions store policy/version, factors and explanation."*

- **Risk Formula**: Risk Score (0–100 scale) is computed from normalized weighted factors:
  1. **Base Vulnerability Severity (CVSS v3/v4)**: 35% weight
  2. **Exploitability & Threat Intelligence (EPSS, CISA KEV)**: 25% weight (KEV presence provides high multiplier)
  3. **Asset Criticality**: 20% weight (`TIER_1_CRITICAL` = 1.0, `TIER_2_HIGH` = 0.8, `TIER_3_MEDIUM` = 0.5, `TIER_4_LOW` = 0.2)
  4. **Environment Exposure**: 10% weight (`PRODUCTION_INTERNET_FACING` = 1.0, `PRODUCTION_INTERNAL` = 0.7, `STAGING` = 0.4, `DEVELOPMENT` = 0.2)
  5. **Compensating Controls & Finding Age**: 10% weight
- **Audit & Traceability**:
  - Every evaluated finding stores: `policyId`, `policyVersion`, `calculatedScore`, `severityBand` (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`, `INFO`), `factorScores` (breakdown of each factor's input, weight, and contribution), and a human-readable `explanation`.
  - Recalculation is idempotent and triggered upon finding updates, asset criticality adjustments, or threat intelligence feed refreshes.
- **Tenant Customization**: Tenants can configure custom factor weights and thresholds while inheriting global platform security baselines.
