# Engineering Constitution

This repository implements a multi-tenant enterprise security exposure platform.

## Mandatory rules

1.  Preserve tenant isolation in every request, job, event, cache key, search document and object path.
2.  Controllers validate/authorize/invoke use cases; business logic belongs in application/domain layers.
3.  Never bypass RBAC/ABAC/resource authorization.
4.  Never trust client-supplied tenant/resource identity.
5.  Never store secrets in source, logs or fixtures.
6.  Validate all external input.
7.  Normalize external security data into canonical models while retaining provenance.
8.  Do not create duplicate canonical vulnerabilities or assets.
9.  Preserve conflicting source observations and reconciliation decisions.
10. Large workloads are asynchronous, idempotent and observable.
11. Never destructively delete historical security evidence.
12. Risk decisions store policy/version, factors and explanation.
13. Remediation requires authorization, policy checks, approvals where configured, safeguards and verification.
14. Initial AI is read-only and authorization-aware.
15. Material security/admin actions are audited.
16. API, event and connector contracts are versioned.
17. Architectural changes require an ADR.
18. Do not modify unrelated modules.
19. Every feature needs appropriate unit, integration, authorization, contract and regression tests.
20. Update docs whenever contracts or behavior change.
21. Security defaults fail closed.
22. Use structured logs and correlation IDs; never log secrets.
23. Search is derived data; MongoDB/domain stores remain authoritative.
24. Preserve backward compatibility for supported API versions.

---

## Required Feature Workflow

```text
Read docs → Identify domain owner → Define authorization/tenant boundary
  → Reuse/create canonical contract → Persistence/events
  → Domain/application implementation → Infrastructure adapter
  → API/integration boundary → Tests → Docs/ADR → Security/performance checks
```

---

## Implementation Standards & Architecture Invariants

### 1. Multi-Tenancy & Identity Enforcement
- **Tenant Extraction**: Always extract `tenantId` from authenticated credentials (`req.user.tenantId`). Reject and ignore any client-supplied `tenantId` in `req.body`, `req.query`, or headers.
- **Query Scoping**: Every database read, update, aggregate, and delete query must include `{ tenantId: user.tenantId }`. Cross-tenant queries are exclusively restricted to platform admins with explicit platform scope.
- **Cache Isolation**: Redis keys must be scoped by tenant: `tenant:{tenantId}:{resource}:{id}` (ADR-010).
- **Domain Event Scoping**: Every domain event envelope must carry an immutable `tenantId` (ADR-006).

### 2. Clean Architecture Layering
- **API Controllers** (`src/api/`): Only validate incoming payloads via Joi schemas, check role authorization, and invoke application use cases. Controllers must not contain database logic.
- **Application Layer** (`src/application/`): Orchestrate domain logic, manage transactions, emit domain events, and invoke repositories via dependency injection.
- **Domain Layer** (`src/domain/`): Pure business logic, state machines (ADR-007), risk policies (ADR-008), password hashing policies, and custom domain errors. No HTTP or database framework dependencies.
- **Infrastructure Layer** (`src/infrastructure/`): Database adapters (MongoDB), caching (Redis/ioredis), event emitters, and external API connectors.

### 3. Finding Lifecycle & State Machine (ADR-007)
- Finding status must strictly transition according to the defined state machine:
  - Valid transitions from `OPEN`: `IN_PROGRESS`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `RESOLVED`.
  - Transitions to `ACCEPTED_RISK` and `FALSE_POSITIVE` require a mandatory justification note and actor ID.
  - Direct invalid state jumps (e.g., `RESOLVED` directly back to `IN_PROGRESS`) must throw a validation error.
- Never destructively delete findings; record transitions in the audit trail.

### 4. Contextual Risk Scoring (ADR-008)
- Every calculated contextual risk score must store:
  1. Policy identifier and version (e.g., `v1.0.0`).
  2. Weighted factors (asset criticality, environment, exploitability, reachability).
  3. Human-readable explanation justifying the final score.

### 5. Security & Secret Hygiene
- **Authentication**: Passwords must be hashed using `scrypt` with cryptographic salts. Refresh tokens must be hashed with SHA-256 before persistence.
- **Replay Protection**: Refresh token reuse must revoke the entire session token family immediately.
- **Logging**: Structured logs (JSON) must include `correlationId` and `requestId`. Sensitive fields (`password`, `token`, `secret`, `authorization`, `creditCard`) must be scrubbed automatically.
- **Fail Closed**: Any unauthenticated, malformed, or ambiguous authorization request must fail closed with an appropriate HTTP 401/403 status.

### 6. Testing & Quality Requirements
- All feature additions or bug fixes must include corresponding tests under `tests/unit/`, `tests/authorization/`, or `tests/integration/`.
- Run tests via `node --test tests/unit/*.test.js` or `npm test` before submitting changes.
