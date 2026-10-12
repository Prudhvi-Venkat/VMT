# Frontend integration contract

The tenant-admin integration screen is backed exclusively by `/backend-api/api/v1/integrations`. It sends `type`, `projectId`, `credentials`, and non-sensitive `config`; it does not create repositories locally or retain a sample integration store.

GitHub is configured as an App. After creation, tenant administrators can test the connection, discover accessible repositories, select the default branch and manifest, and queue a project-scoped scan. Cloud cards configure AWS, Azure, or GCP project connections and display only masked status returned by the backend.

The application shell is shared by all authenticated users. Navigation items and administrative links are filtered by the permissions serialized in the login profile; server-side permission checks remain authoritative.
