# Remediation Engine

Flow:
`Recommendation → Plan → Target validation → Policy check → Approval → Dry-run → Backup/Snapshot → Canary → Execute → Validate → Rollback if required → Verify`

Controls: RBAC/ABAC, maintenance windows, business calendars, approvals,
separation of duties, blast-radius limits, canary percentage, rate
limits, backups, rollback strategy, pre/post checks and
change-management linkage.

Execution states: Draft, Awaiting Approval, Approved, Scheduled, Dry
Run, Canary, Executing, Validating, Succeeded, Failed, Rolled Back.
