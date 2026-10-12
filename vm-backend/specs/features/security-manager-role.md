# Security Manager Role

Tenant-scoped oversight role that can read every scan and every active
vulnerability in its tenant and take remediation actions, without gaining
tenant user or project administration.

Status: **implemented** (backend + frontend). This document is the source of
truth for the role's contract; the canonical code lives in
`src/domain/policies/role-permission-policy.js`.

---

# 1. Role identifier

```text
SECURITY_MANAGER
```

Distinct from the legacy, currently unused `SECURITY_ADMIN`, `SECURITY_ANALYST`
and `VIEWER` identifiers. Those remain defined for compatibility and are not
wired to any navigation or provisioning flow.

---

# 2. Permission set

Granted:

```text
tenant:projects:read
assets:read
assets:create
assets:update
assets:delete
scans:create
scans:read
scans:cancel
sbom:upload
sbom:review
findings:read
findings:update
findings:comment
findings:assign
findings:resolve
findings:close
findings:reopen
audit:read
```

Explicitly **not** granted:

```text
tenant:users:*
tenant:projects:write
integrations:manage
*
```

`sbom:review` is required because the frontend scan flow calls
`POST /scans/inspect` before upload.

---

# 3. Access semantics

* Scan and finding reads are tenant-wide: repositories filter only by
  `tenantId`, so no per-project scoping is applied for this role.
* "Active" is defined by two status sets exported from the domain entities:

  ```text
  ACTIVE_SCAN_STATUSES    = QUEUED, PARSING, NORMALIZING, MATCHING, ENRICHING
  ACTIVE_FINDING_STATUSES = OPEN, TRIAGED, IN_PROGRESS
  ```

* `GET /scans` and `GET /findings` accept `?active=true`. An explicit
  `status=` filter takes precedence over `active=true`.
* Remediation is the standard finding lifecycle endpoint
  (`PATCH /findings/:findingId/status`, gated on `findings:update`) plus scan
  cancellation (`scans:cancel`).

---

# 4. Provisioning

* Only `TENANT_SUPER_ADMIN` (or `PLATFORM_ADMIN`) may create a user
  (`POST /tenant/users`, inline check in `tenant-admin.routes.js`).
* Role is assigned at create time through the tenant admin "Access Role"
  picker. `SECURITY_MANAGER` is added to both the backend Joi enum
  (`createUserSchema`) and the UI picker.
* There is intentionally **no** change-role endpoint.

---

# 5. Login and navigation

* `SECURITY_MANAGER` is exempt from the `NO_ASSIGNED_PROJECTS` login gate
  (`auth.service.js`) so oversight access does not require project assignment.
* Scan upload is permitted though the role is not a tenant admin
  (`vulnerability-scanner.controller.js` `isExempt`).
* The frontend exposes `isSecurityManager` / `hasRole` via the auth context and
  redirects the role to the dedicated `/security-oversight` view.

---

# 6. Audit access

`GET /tenant/audit` is permission-based (`requirePermission('audit:read')`).
As a consequence any role holding `audit:read` can read the tenant audit
trail; currently that is `TENANT_SUPER_ADMIN`, `TENANT_ADMIN`,
`PLATFORM_ADMIN` and `SECURITY_MANAGER`.

---

# 7. Contract test

`vm-app/tests/role-contract.test.js` (run with `npm test` in `vm-app`) asserts
that the roles offered by the tenant-admin "Access Role" picker are a subset of
the roles accepted by the backend `createUserSchema` validator, and that
`SECURITY_MANAGER` is selectable. This prevents the UI enum from drifting
ahead of the backend enum.

---

# 8. Known follow-ups (out of scope)

* Legacy `SECURITY_ADMIN` / `SECURITY_ANALYST` / `VIEWER` remain unwired.
* The exempt-admin role lists are duplicated between `auth.service.js` and
  `vulnerability-scanner.controller.js`; consider centralizing them.
* Role changes after creation and post-login role refresh are not implemented.
