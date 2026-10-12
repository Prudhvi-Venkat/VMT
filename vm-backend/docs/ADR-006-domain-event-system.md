# ADR-006: Domain Event System and Asynchronous Decoupling

## Decision

The platform adopts an in-process and distributed-ready Domain Event System to decouple bounded contexts (scans, findings, assets, tenants, integrations, audit) and enable asynchronous, idempotent event-driven workflows.

- **Envelope Contract**: Every event conforms to the canonical `DomainEvent` envelope with fields: `eventId` (UUIDv4), `eventType` (e.g., `scan.completed`), `schemaVersion` (integer), `tenantId`, `occurredAt` (ISO-8601), `correlationId`, `causationId`, `producer` (`vm-backend`), and `payload`.
- **Tenant Isolation**: `tenantId` is strictly enforced on all events (except platform-level events which use `PLATFORM_TENANT_ID`). Consumers must scope all queries and cache operations to the event's `tenantId`.
- **Event Bus**: The `EventBus` provides publish/subscribe capabilities with synchronous and asynchronous handlers, error isolation (a failing listener does not crash the producer unless explicitly configured), and idempotent event delivery tracking.
- **Idempotency**: An in-memory/Redis deduplication mechanism tracks processed `eventId`s to prevent duplicate execution during at-least-once deliveries.

## Core Events

- `scan.created`, `scan.completed`, `scan.failed`
- `finding.created`, `finding.status_changed`, `finding.assigned`
- `asset.created`, `asset.updated`, `asset.deleted`
- `tenant.created`, `tenant.suspended`, `tenant.activated`
- `user.created`, `user.authenticated`, `user.locked`
- `risk.assessment.updated`
