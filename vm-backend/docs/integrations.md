# Integration boundaries

The tenant-admin UI requires a selected project for normal integrations and offers tenant-wide scope only to a tenant super admin. GitHub is configured as a GitHub App, not a long-lived personal token. The backend exchanges the configured App credentials for an installation token, discovers repositories, reads the selected branch/manifest, and queues a tenant-scoped scanner job.

Cloud integrations are represented by the same project integration record and are copied into the project’s normalized `cloudAccounts` metadata without secret fields. AWS stores account/region plus encrypted access or role credentials, Azure stores tenant/subscription/client identifiers plus encrypted client credentials, and GCP stores the project identifier plus encrypted service-account material.

All integration mutations, validation, repository selection, and scans emit tenant audit events. API responses contain only masked credential references and validation status. Frontend calls use the backend route names and `type` payload field.
