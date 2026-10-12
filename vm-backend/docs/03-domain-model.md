# Domain Model

## Core entities

**Tenant:** id, parentTenantId, type, isolationTier, policySet, status.
**User:** id, tenantId, identity provider, roles, attributes, status.
**Asset:** canonical identity, source identifiers, type, attributes,
owner, criticality, environment, provenance, correlation confidence.
**AssetRelationship:** source, target, type, confidence, provenance,
validFrom/validTo. **Vulnerability:** canonical key, identifiers,
affected products/packages, severity, exploit signals, sources,
versions, confidence. **Finding:** tenant, asset, vulnerability/type,
evidence, source observations, risk snapshot, owner, SLA, exception,
remediation, lifecycle. **Evidence:** source, raw reference, normalized
payload, observedAt, hash, retention class. **RiskAssessment:** score,
factors, policy/version, explanation, timestamp. **Integration:**
connector, auth reference, capabilities, contract version, health.
**IngestionJob:** integration, state, counters, cursor, idempotency,
retries. **WorkflowInstance:** definition, subject, state, approvals,
history, version. **RemediationExecution:** plan, target scope,
approvals, execution, validation, rollback. **AuditEvent:** actor,
action, resource, before/after, policy decision, correlation, timestamp,
integrity metadata.

Source identities are retained; canonical identities are stable. Scanner
disappearance does not equal deletion.
