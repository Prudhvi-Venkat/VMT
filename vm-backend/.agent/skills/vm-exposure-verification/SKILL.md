---
name: vm-exposure-verification
description: >-
  Execute verification runbooks for the vm-backend multi-tenant exposure platform.
  Run when verifying code changes, testing tenant isolation, validating security policies,
  checking finding lifecycle state machine rules, or performing regression testing.
---

# Vulnerability Exposure Platform Verification Runbook

This skill defines the canonical verification and testing workflows for `vm-backend`, enforcing the **Engineering Constitution** (AGENTS.md) and architectural decision records (ADRs).

---

## 1. Quality Gates & Test Suites

The repository uses the native Node.js test runner (`node --test`). Tests are categorized across four critical protection layers:

### A. Fast Unit Verification (Domain & Policies)
Tests domain policies (passwords, JWT, session, roles), finding lifecycle state machine (ADR-007), risk engine (ADR-008), parsers, and cache scoping (ADR-010).

```powershell
node --test tests/unit/*.test.js
```

### B. Multi-Tenant Isolation & Authorization
Validates that tenant boundaries cannot be breached, RBAC/ABAC policies hold, and resources belonging to Tenant A are never accessible or leaked to Tenant B.

```powershell
node --test tests/authorization/*.test.js tests/integration/multi-tenant-isolation.test.js
```

### C. Security & Concurrency Verification
Validates brute-force lockout, refresh token replay detection and family revocation, race-condition handling, and secret scrubbing in structured logs and audit trails.

```powershell
node --test tests/security/*.test.js
```

### D. Full Regression Suite
Executes all test suites across the codebase.

```powershell
npm test
```
*(Runs `node --test tests/**/*.test.js`)*

---

## 2. Mandatory Verification Checklist

Before proposing or merging any changes, verify against these non-negotiable architectural rules:

### 1. Tenant Isolation (Rules 1, 4)
- [ ] Tenant identity is **never** accepted from `req.body`, `req.query`, or unvalidated route parameters.
- [ ] Tenant ID is strictly extracted from verified authentication tokens (`req.user.tenantId`).
- [ ] Every MongoDB query, update, or aggregation pipeline contains `{ tenantId: user.tenantId }`.
- [ ] Cache keys in Redis explicitly include tenant prefixes (e.g., `tenant:{tenantId}:...`).
- [ ] Domain events include immutable `tenantId` in the event envelope.

### 2. Architecture & Layering Boundaries (Rule 2)
- [ ] Controllers **only** validate incoming input (via Joi), check authorization, and invoke application use cases.
- [ ] No domain logic or direct database queries inside controller handlers.
- [ ] Business logic resides exclusively in `application/` and `domain/`.

### 3. Finding Lifecycle Compliance (ADR-007 / Rule 11)
- [ ] State transitions follow the canonical finite state machine:
  - Allowed from `OPEN`: `IN_PROGRESS`, `ACCEPTED_RISK`, `FALSE_POSITIVE`, `RESOLVED`.
  - Disallowed jumps (e.g., direct `RESOLVED -> IN_PROGRESS` without reopen).
- [ ] Transitions to `ACCEPTED_RISK` and `FALSE_POSITIVE` **must** require a justification reason.
- [ ] Historical security evidence is never deleted destructively; status updates create audit logs.

### 4. Contextual Risk Engine Compliance (ADR-008 / Rule 12)
- [ ] Risk scoring records `policyVersion`, individual `factors`, and human-readable `explanation`.
- [ ] Scoring remains normalized on a consistent scale (0–100).

### 5. Secret Scrubbing & Safe Observability (Rules 5, 22)
- [ ] No tokens, passwords, API keys, or raw hashes appear in logs or audit events.
- [ ] Log output uses structured JSON with `correlationId` and `requestId`.
- [ ] Security defaults fail closed: unauthenticated or unauthorized requests yield immediate rejections.

---

## 3. Failure Triage & Diagnostics

| Symptom | Diagnostic Step | Remediation |
| :--- | :--- | :--- |
| **Cross-Tenant Leakage Test Fails** | Check query filters in repository layer | Ensure `{ tenantId }` is bound in query criteria; check that request handlers don't overwrite authenticated context. |
| **Token Replay Test Fails** | Inspect `SessionPolicy` and `tests/security/` | Verify token family revocation: when an old refresh token is reused, all tokens in that family must be invalidated. |
| **Finding State Transition Rejected** | Check `FindingLifecyclePolicy` | Ensure transition requested matches permitted edges in ADR-007 state machine. |
| **Missing Audit Event** | Check event emitter or audit logger | Ensure security-sensitive actions invoke audit logging with `correlationId`. |
