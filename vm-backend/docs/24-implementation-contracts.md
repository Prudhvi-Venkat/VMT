# Implementation Contracts

## Repository boundaries

Controllers depend on application use cases. Use cases depend on domain
interfaces. Infrastructure implements interfaces. Workers invoke
application use cases rather than duplicating business rules.

## Data access

Every repository method accepts explicit tenant context. Queries must be
bounded, indexed and pagination-aware.

## Events

Events are immutable contracts. Consumers must tolerate duplicate
delivery. Schema changes are versioned and backward-compatible where
possible.

## Integrations

Raw source data is stored before normalization when retention policy
requires it. Normalization is deterministic and replayable.

## Risk

Risk calculation is pure with respect to its input snapshot and policy
version. Persist the decision metadata.

## API

OpenAPI is the contract. Validation occurs before use-case execution.
Authorization is server-side.

## Observability

Every request/job/event has a correlation ID. Metrics and traces must
identify the owning service and operation.

## Migrations

Database/index migrations are backward-compatible, observable and
reversible where practical. Destructive migrations require an ADR and
recovery plan.
