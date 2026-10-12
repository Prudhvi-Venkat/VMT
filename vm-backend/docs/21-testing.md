# Testing Strategy

Layers: unit, domain-policy, repository integration, API integration,
authorization, tenant isolation, contract, event schema, connector,
search/index, workflow, remediation safety, performance/load, security
and end-to-end.

Mandatory security tests include cross-tenant denial, privilege
escalation denial, unauthorized remediation denial, expired approval
denial, invalid webhook signature rejection, replay/idempotency
validation and secret-free logs.

Definition of done includes implementation, tests, docs, observability,
authorization and migration considerations.
