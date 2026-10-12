# Enterprise Integration Platform

Every connector defines metadata, authentication, capabilities, contract
version, operations, schemas, pagination, rate limits, retries, health,
provenance mapping and idempotency.

Patterns: REST, GraphQL, webhooks, files, object storage, SFTP,
queues/event streams, databases, agents and scheduled polling.

Reliability: exponential backoff, retry classification, DLQ, replay,
checkpoints, rate limiting, circuit breakers, schema evolution and
health scoring.

Connector failure must not compromise platform availability or tenant
isolation.
