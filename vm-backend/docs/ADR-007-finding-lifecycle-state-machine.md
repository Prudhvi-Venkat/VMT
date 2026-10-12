# ADR-007: Finding Lifecycle State Machine and Policy Transitions

## Decision

Vulnerability findings are governed by a strict, state-machine-driven lifecycle to guarantee auditability, prevent unauthorized status leaps, and enforce SLA escalation.

- **Canonical Statuses**: `OPEN`, `TRIAGED`, `IN_PROGRESS`, `MITIGATED`, `RESOLVED`, `FALSE_POSITIVE`, `ACCEPTED_RISK`, `REOPENED`.
- **Allowed Transitions**:
  - `OPEN` -> `TRIAGED`, `FALSE_POSITIVE`, `ACCEPTED_RISK`
  - `TRIAGED` -> `IN_PROGRESS`, `FALSE_POSITIVE`, `ACCEPTED_RISK`, `RESOLVED`
  - `IN_PROGRESS` -> `MITIGATED`, `RESOLVED`, `ACCEPTED_RISK`
  - `MITIGATED` -> `RESOLVED`, `REOPENED`
  - `RESOLVED` -> `REOPENED`
  - `FALSE_POSITIVE` -> `REOPENED`
  - `ACCEPTED_RISK` -> `REOPENED`, `EXPIRED`
- **Transition Authorization**:
  - `ACCEPTED_RISK` requires `findings:accept_risk` permission and mandatory justification / expiration date.
  - `FALSE_POSITIVE` requires `findings:false_positive` permission and justification.
  - Standard status changes require `findings:update` permission.
- **Audit Provenance**: Every transition appends an immutable entry to `finding.timeline` containing `fromStatus`, `toStatus`, `changedBy` (userId), `changedAt` (timestamp), `reason`, and `metadata`.
- **SLA Tracking**: Findings compute target remediation deadlines based on normalized severity (`CRITICAL`: 7 days, `HIGH`: 14 days, `MEDIUM`: 30 days, `LOW`: 60 days, `INFO`: 90 days), with overdue tracking.
