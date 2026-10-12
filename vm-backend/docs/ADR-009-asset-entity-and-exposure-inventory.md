# ADR-009: Asset Entity and Canonical Exposure Inventory

## Decision

The platform introduces a first-class `Asset` canonical entity to represent scanned entities (repositories, container images, hosts, cloud accounts, packages) and anchor vulnerability findings, risk evaluations, and ownership.

- **Canonical Model**:
  - `assetId` (canonical UUID/identifier)
  - `tenantId` (strict isolation)
  - `projectId` (project affiliation)
  - `name` & `displayName`
  - `type` (`REPOSITORY`, `CONTAINER_IMAGE`, `HOST`, `SERVERLESS_FUNCTION`, `CLOUD_RESOURCE`, `PACKAGE`)
  - `criticality` (`TIER_1_CRITICAL`, `TIER_2_HIGH`, `TIER_3_MEDIUM`, `TIER_4_LOW`)
  - `environment` (`PRODUCTION`, `STAGING`, `DEVELOPMENT`, `TEST`)
  - `internetFacing` (boolean)
  - `owner` (`ownerEmail`, `ownerTeamId`, `businessUnit`)
  - `identifiers` (array of external source IDs: git repo URL, AWS ARN, Docker digest, etc.)
  - `tags` (key-value metadata)
  - `stats` (openFindingsCount, criticalCount, highCount, compositeRiskScore)
  - `lastScannedAt`, `createdAt`, `updatedAt`
- **Reconciliation & Correlation**:
  - Scans correlate findings to assets via matching source identifiers (e.g. repo URL or project name).
  - Assets can be automatically created/updated upon scan ingestion if not previously registered.
- **REST Endpoints**:
  - `GET /api/v1/assets` (tenant-scoped listing with filtering & pagination)
  - `POST /api/v1/assets` (register new asset)
  - `GET /api/v1/assets/:assetId` (retrieve asset details + summary)
  - `PATCH /api/v1/assets/:assetId` (update criticality, owner, tags, environment)
  - `DELETE /api/v1/assets/:assetId` (soft deletion / deactivation)
