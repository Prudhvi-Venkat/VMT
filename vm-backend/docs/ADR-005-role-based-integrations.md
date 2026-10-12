# ADR-005: Role-based dashboards and project integrations

## Decision

The backend is authoritative for identity, permissions, tenants, projects, integrations, scans, findings, and vulnerability intelligence.

- `PLATFORM_ADMIN` is platform-scoped. It provisions tenants and platform settings but cannot impersonate a tenant or run tenant scans.
- `TENANT_SUPER_ADMIN` and `TENANT_ADMIN` operate in their tenant. Integrations are project-scoped by default; only a tenant super admin may create a tenant-wide integration.
- `END_USER` can scan and review findings according to the permissions in the authenticated principal, but cannot manage integrations.
- The frontend uses one shell and filters navigation from serialized permissions. Every protected backend route repeats the permission check.

## Credential boundary

Integration records contain tenant and project context, provider, display metadata, non-sensitive configuration, masked credential references, validation state, and audit metadata. Secret material is encrypted with AES-256-GCM using `INTEGRATION_ENCRYPTION_KEY` (or the existing JWT secret for compatible deployments). Raw credentials are never returned or logged.

GitHub uses App ID, installation ID, and an encrypted private key. Repository discovery and scan submission use an installation token created by the backend. AWS, Azure, and GCP connections currently validate configuration and expose normalized health metadata; asset discovery is intentionally a later capability.

## Provider routes

The canonical API is:

`GET/POST /api/v1/integrations`, `GET /:integrationId`, `POST /:integrationId/test`, `GET /:integrationId/repositories`, `POST /:integrationId/repositories/:repositoryId/scan`, `PATCH /:integrationId`, and `DELETE /:integrationId`.

Deletion is deactivation so audit history and provider provenance remain available.
