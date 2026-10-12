# Implement Authentication & Platform Admin Authorization

You are implementing the authentication and authorization foundation for the Enterprise Security Exposure Platform.

This is a security-critical feature. Do not start coding immediately.

## 1. Mandatory documentation to read first

Before making any changes, read:

* `AGENTS.md`
* `README.md`
* `docs/01-requirements.md`
* `docs/02-system-architecture.md`
* `docs/03-domain-model.md`
* `docs/12-authentication.md`
* `docs/13-authorization.md`
* `docs/14-multi-tenancy.md`
* `docs/15-api-standards.md`
* `docs/19-security.md`
* `docs/20-observability.md`
* `docs/21-testing.md`
* `docs/24-implementation-contracts.md`

Also inspect the existing source code before introducing new modules.

Do not invent architecture that conflicts with these documents.

---

# 2. Current scope

Implement only the initial authentication and authorization foundation.

### Current supported role

```text
PLATFORM_ADMIN
```

Do NOT implement additional roles yet.

However, the architecture must be designed so that future roles can be added without rewriting authentication or authorization.

Future roles may include:

```text
TENANT_ADMIN
SECURITY_ADMIN
SECURITY_ANALYST
ASSET_OWNER
APPLICATION_OWNER
AUDITOR
VIEWER
```

Do not implement these now.

---

# 3. Objective

Implement a secure authentication system that supports:

```text
User
  ↓
Login
  ↓
Credential validation
  ↓
Account validation
  ↓
Authentication
  ↓
Session/token creation
  ↓
Access token
  ↓
Protected API
  ↓
Authentication validation
  ↓
Platform Admin authorization
  ↓
Application resource
```

The implementation must correctly handle:

* user validation
* password validation
* account status
* authentication failures
* access-token validation
* refresh-token rotation
* session validation
* session revocation
* logout
* token expiration
* refresh-token expiration
* revoked sessions
* disabled users
* role validation
* authorization failures
* brute-force protection
* audit logging
* security event logging
* tenant/platform boundaries
* concurrent sessions
* token replay protection
* secure error responses

---

# 4. First create an implementation plan

Before modifying code:

1. Inspect the repository.
2. Identify existing authentication code.
3. Identify existing middleware.
4. Identify existing MongoDB infrastructure.
5. Identify existing Redis infrastructure.
6. Identify existing logging/audit infrastructure.
7. Identify existing configuration/environment handling.
8. Identify existing test framework.
9. Identify existing user model, if any.
10. Identify existing API conventions.

Then produce a concise implementation plan.

Do not modify files during this analysis step.

The plan must identify:

* modules to create
* modules to modify
* database collections
* indexes
* authentication flow
* token flow
* session flow
* authorization flow
* middleware
* security controls
* audit events
* tests
* environment variables
* migration requirements

Wait for implementation approval if operating in a planning-first workflow.

---

# 5. Authentication architecture

Use a layered architecture.

The implementation must follow:

```text
Controller
    ↓
Application Use Case
    ↓
Authentication Service
    ↓
Domain Policies
    ↓
Repository Interfaces
    ↓
Infrastructure
```

Do NOT put authentication business logic directly inside Express controllers.

Controllers should only handle:

* request parsing
* validation
* invoking use cases
* response serialization

---

# 6. User model

Create a canonical user model suitable for future enterprise authentication.

Suggested conceptual fields:

```text
User
├── id
├── username/email
├── passwordHash
├── status
├── roles[]
├── tenantId / platformScope
├── mfa configuration metadata
├── failedLoginAttempts
├── lockedUntil
├── lastLoginAt
├── lastFailedLoginAt
├── passwordChangedAt
├── createdAt
├── updatedAt
└── security metadata
```

Do not store:

* plaintext passwords
* plaintext refresh tokens
* access tokens
* passwords in logs
* secrets in source code

Use an appropriate password hashing algorithm such as Argon2id or another approved modern password-hashing mechanism.

Do not implement custom cryptography.

---

# 7. Platform Admin

For the initial implementation:

```text
Role:
PLATFORM_ADMIN
```

The authorization layer must still be generic.

Do NOT write logic such as:

```text
if user.role === "PLATFORM_ADMIN"
```

throughout the application.

Instead implement a reusable authorization abstraction:

```text
Principal
    ↓
Roles
    ↓
Permissions
    ↓
Policy Evaluation
    ↓
Allow / Deny
```

For now, map:

```text
PLATFORM_ADMIN
    ↓
Platform-level administrative permissions
```

Future roles must be able to plug into the same authorization system.

---

# 8. Authentication states

Support explicit account states.

At minimum:

```text
ACTIVE
DISABLED
LOCKED
PENDING
```

Login must only succeed for an appropriate active account.

Do not reveal whether a username/email exists through overly specific login errors.

For example, avoid responses such as:

```text
User does not exist
```

when this could enable account enumeration.

Use a generic authentication failure response.

---

# 9. Login flow

Implement:

```text
POST /api/v1/auth/login
```

Expected flow:

```text
Request
 ↓
Validate request schema
 ↓
Locate user
 ↓
Check account state
 ↓
Verify password
 ↓
Evaluate login security policies
 ↓
Create authenticated session
 ↓
Issue access token
 ↓
Issue refresh token
 ↓
Record authentication event
 ↓
Return authentication response
```

The login flow must handle:

### Successful login

* validate credentials
* validate account status
* create session
* generate access token
* generate refresh token
* persist session metadata
* update login metadata
* reset failed-login counter
* create audit/security event
* return authenticated response

### Failed login

* do not reveal whether account exists
* increment failed-login counter where appropriate
* apply lockout policy
* create security event
* do not issue tokens
* do not create an authenticated session

---

# 10. Access token

Use short-lived access tokens.

The exact expiration must be configurable through application configuration.

Do not hard-code production security values.

Access token validation must verify:

* signature
* algorithm
* issuer
* audience
* expiration
* not-before where used
* token type
* subject
* required claims
* session identifier where applicable

Do not trust decoded JWT payloads until cryptographic verification succeeds.

---

# 11. Refresh token

Implement refresh-token rotation.

Endpoint:

```text
POST /api/v1/auth/refresh
```

Flow:

```text
Refresh Token
      ↓
Cryptographic validation
      ↓
Locate session/token record
      ↓
Check token expiration
      ↓
Check session status
      ↓
Check user status
      ↓
Check token family/reuse state
      ↓
Rotate refresh token
      ↓
Invalidate previous refresh token
      ↓
Issue new access token
      ↓
Issue new refresh token
      ↓
Audit event
```

Never store raw refresh tokens in the database.

Store a securely derived hash/fingerprint that allows server-side validation.

---

# 12. Refresh-token reuse detection

This is mandatory.

If a previously rotated refresh token is presented again:

```text
Detect reuse
    ↓
Treat as suspicious
    ↓
Invalidate the affected token family/session
    ↓
Create security event
    ↓
Require fresh authentication
```

Do not silently issue another token.

The implementation must prevent token replay from becoming a persistent authenticated session.

---

# 13. Session model

Create a server-side session model.

Conceptually:

```text
Session
├── id
├── userId
├── tenantId / platformScope
├── refreshTokenHash
├── tokenFamilyId
├── status
├── createdAt
├── expiresAt
├── lastUsedAt
├── revokedAt
├── revokeReason
├── ip metadata
├── userAgent metadata
└── security metadata
```

Possible session states:

```text
ACTIVE
REVOKED
EXPIRED
COMPROMISED
```

Session validation must occur whenever required by the selected authentication architecture.

A valid JWT alone must not allow access when its corresponding server-side session has been revoked.

---

# 14. Logout

Implement:

```text
POST /api/v1/auth/logout
```

Logout must:

* authenticate the current session
* revoke the session
* invalidate refresh-token state
* prevent further refresh
* create audit/security event
* return a safe success response

If logout is called repeatedly, the endpoint should behave safely and idempotently.

---

# 15. Logout from all sessions

Implement:

```text
POST /api/v1/auth/logout-all
```

for the authenticated user.

This must revoke all active sessions belonging to that user.

Do not allow one user to revoke another user's sessions unless that capability is explicitly authorized later.

For the current Platform Admin implementation, keep administrative session management separate from self-service logout.

---

# 16. Session validation middleware

Create reusable authentication middleware.

Conceptually:

```text
authenticateRequest()
```

It must:

1. Extract credentials.
2. Validate token.
3. Validate token claims.
4. Load required session state.
5. Validate session status.
6. Load user.
7. Validate user status.
8. Construct authenticated principal.
9. Attach principal to request context.
10. Continue to authorization.

The request context should contain something conceptually similar to:

```text
AuthenticatedPrincipal
├── userId
├── sessionId
├── tenantId/platformScope
├── roles
├── permissions
└── authenticationMethod
```

Do not attach sensitive credentials to the request context unnecessarily.

---

# 17. Authorization middleware

Create reusable authorization middleware/service.

Examples:

```text
requireAuthenticated()
requireRole("PLATFORM_ADMIN")
requirePermission("platform:admin")
requirePermission("users:read")
```

Prefer permission-based authorization internally.

The role should map to permissions rather than being hard-coded throughout business logic.

For now:

```text
PLATFORM_ADMIN
```

can receive the platform administration permission set.

---

# 18. Role validation

Every protected request must establish:

```text
Authenticated?
    ↓
User active?
    ↓
Session active?
    ↓
Role assigned?
    ↓
Permission granted?
    ↓
Resource policy allows?
```

If any required check fails:

```text
DENY
```

Do not rely on frontend route protection.

All authorization must be enforced server-side.

---

# 19. Platform scope

Platform Admin is a platform-level role.

Do not incorrectly treat Platform Admin as a normal tenant user.

Design the principal/context so the system can later support:

```text
Platform scope
Organization scope
Tenant scope
Business-unit scope
Application scope
Asset scope
```

without rewriting authentication.

For now:

```text
PLATFORM_ADMIN → platform scope
```

---

# 20. Protected test endpoint

Create a simple protected endpoint for validation.

Example:

```text
GET /api/v1/auth/me
```

It should return the authenticated user's safe profile:

```json
{
  "id": "...",
  "username": "...",
  "roles": ["PLATFORM_ADMIN"],
  "status": "ACTIVE"
}
```

Never return:

* password hash
* refresh token
* access token
* security secrets
* internal credential material

---

# 21. Authentication endpoints

Implement at minimum:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
POST /api/v1/auth/logout-all
GET  /api/v1/auth/me
```

Follow the API standards in:

```text
docs/15-api-standards.md
```

Use consistent validation and error responses.

---

# 22. Security protections

Implement appropriate protections for:

### Brute force

* failed-login tracking
* configurable thresholds
* temporary account lockout
* rate limiting

### Credential stuffing

* login endpoint rate limiting
* suspicious repeated failures
* security event generation

### Token attacks

* signature verification
* issuer/audience validation
* expiration
* refresh rotation
* reuse detection
* session revocation

### Session attacks

* server-side session state
* revocation
* expiration
* user-status validation

### Enumeration

Use generic authentication failures.

### Timing

Avoid obviously different authentication behavior between existing and non-existing users where practical.

---

# 23. CSRF / cookie strategy

Before implementation, inspect the existing frontend/backend architecture.

If refresh tokens are stored in cookies:

* use Secure cookies
* use HttpOnly
* configure SameSite appropriately
* implement CSRF protection where required
* never expose refresh tokens to frontend JavaScript unnecessarily

If refresh tokens are not cookie-based, document the threat model and storage strategy.

Do not choose a browser token-storage mechanism casually.

Do not store long-lived sensitive tokens in localStorage by default.

---

# 24. Configuration

All security-sensitive values must be configurable.

Examples:

```text
JWT_ISSUER
JWT_AUDIENCE
JWT_ACCESS_TOKEN_TTL
REFRESH_TOKEN_TTL
SESSION_TTL
MAX_LOGIN_ATTEMPTS
ACCOUNT_LOCK_DURATION
LOGIN_RATE_LIMIT
REFRESH_RATE_LIMIT
COOKIE_SECURE
COOKIE_SAME_SITE
```

Use environment/configuration validation at application startup.

Do not commit secrets.

---

# 25. Audit events

Create explicit authentication/security events.

Examples:

```text
auth.login.success
auth.login.failure
auth.account.locked
auth.logout
auth.logout_all
auth.refresh.success
auth.refresh.failure
auth.refresh.reuse_detected
auth.session.revoked
auth.session.expired
auth.user.disabled
auth.authorization.denied
```

Audit events must contain enough information for investigation without storing credentials or secrets.

Every event should include correlation information.

---

# 26. Logging requirements

Use structured logging.

Log security-relevant metadata such as:

* event type
* user ID where known
* session ID where appropriate
* request ID
* correlation ID
* timestamp
* authentication result
* reason category
* source metadata where permitted

Never log:

```text
password
passwordHash
accessToken
refreshToken
authorization header
session secret
MFA secret
private key
```

---

# 27. Error handling

Use safe external errors.

For login:

```text
Invalid credentials
```

rather than:

```text
Email does not exist
Password is incorrect
```

For protected endpoints:

```text
401 Unauthorized
```

when authentication is missing/invalid.

Use:

```text
403 Forbidden
```

when authentication succeeds but authorization fails.

Do not expose internal security decisions or implementation details.

---

# 28. Database requirements

Create appropriate MongoDB collections/models for:

```text
users
sessions
auditEvents
```

Potential supporting collections can be introduced only when justified.

Create indexes for:

* username/email lookup
* user status
* session ID
* user ID
* token family ID
* session status
* expiration/TTL where appropriate
* audit lookup fields

Do not create indexes blindly.

Document the reason for every important index.

Use MongoDB TTL indexes only where automatic expiration is semantically safe.

Historical audit/security records must not be unintentionally removed by a TTL index.

---

# 29. Redis

If Redis is already part of the platform architecture, evaluate it for:

* rate limiting
* short-lived login counters
* temporary security state
* distributed locks where necessary
* token/session coordination where appropriate

Do not duplicate authoritative session state between MongoDB and Redis without defining consistency rules.

MongoDB/session persistence remains authoritative unless the architecture explicitly defines otherwise.

---

# 30. Concurrency requirements

Handle concurrent refresh requests safely.

Example:

```text
Request A → refresh token
Request B → same refresh token
```

The implementation must not allow both requests to successfully rotate the same refresh token.

Use an appropriate atomic/transaction/locking strategy.

Add a regression test specifically for concurrent refresh.

---

# 31. Tests

This feature requires extensive tests.

## Unit tests

Test:

* password verification
* account-state policy
* token claims
* token expiration
* role mapping
* permission mapping
* session policy
* refresh rotation
* reuse detection

## Integration tests

Test:

* login
* refresh
* logout
* logout-all
* `/auth/me`
* disabled user
* locked user
* expired session
* revoked session

## Authorization tests

Test:

```text
No token → denied
Invalid token → denied
Expired token → denied
Revoked session → denied
Disabled user → denied
Authenticated non-authorized role → denied
PLATFORM_ADMIN → allowed
```

## Security tests

Test:

```text
Brute-force protection
Account lockout
Refresh-token replay
Concurrent refresh
Token tampering
Invalid signature
Wrong issuer
Wrong audience
Expired token
Invalid token type
Session revocation
User disablement
Cross-user session access
Credential leakage
Sensitive logging
```

## Tenant/platform tests

Verify that a future tenant-scoped principal cannot accidentally gain Platform Admin privileges.

For now, Platform Admin is the only implemented role, but the authorization architecture must make this boundary explicit.

---

# 32. Acceptance criteria

The feature is complete only when all of the following are true:

* [ ] Platform Admin can log in.
* [ ] Invalid credentials are rejected safely.
* [ ] Disabled users cannot authenticate.
* [ ] Locked users cannot authenticate.
* [ ] Access tokens expire.
* [ ] Expired access tokens are rejected.
* [ ] Refresh tokens rotate.
* [ ] Previous refresh tokens become invalid.
* [ ] Refresh-token reuse is detected.
* [ ] Compromised token families/sessions can be revoked.
* [ ] Logout revokes the session.
* [ ] Logout-all revokes all user sessions.
* [ ] Revoked sessions cannot authenticate requests.
* [ ] User status is revalidated where required.
* [ ] `/auth/me` returns only safe user information.
* [ ] Platform Admin authorization works.
* [ ] Unauthorized requests return 403.
* [ ] Unauthenticated requests return 401.
* [ ] Brute-force protection works.
* [ ] Authentication events are audited.
* [ ] Secrets are never logged.
* [ ] Passwords are never stored in plaintext.
* [ ] Refresh tokens are never stored in plaintext.
* [ ] Concurrent refresh is safe.
* [ ] Security-sensitive configuration is externalized.
* [ ] Tests cover all critical authentication paths.
* [ ] API documentation is updated.
* [ ] Observability is implemented.
* [ ] No unrelated modules are modified.

---

# 33. Definition of done

Before declaring the feature complete:

1. Run type checking.
2. Run linting.
3. Run unit tests.
4. Run integration tests.
5. Run authorization tests.
6. Run tenant/platform isolation tests.
7. Run security tests.
8. Inspect database indexes.
9. Review authentication logs for secret leakage.
10. Review token/session lifecycle.
11. Review refresh-token replay protection.
12. Review race conditions.
13. Review error responses.
14. Review API documentation.
15. Review changed files for unrelated modifications.

Then provide:

```text
Implementation summary
Changed files
New files
Database changes
API endpoints
Authentication flow
Authorization flow
Security controls
Audit events
Tests executed
Test results
Known limitations
Future extension points
```

Do not claim the feature is complete if any critical acceptance criterion is failing.

# 34. Important implementation constraint

Do not implement:

* additional roles
* SAML provider configuration
* OIDC provider configuration
* WebAuthn
* password reset
* email verification
* full MFA enrollment UI
* tenant administration
* user administration
* autonomous AI authorization
* remediation permissions

unless the existing repository already requires them for the authentication foundation.

Keep the architecture extensible, but implement only the currently approved scope:

**Authentication + session management + Platform Admin authorization.**
