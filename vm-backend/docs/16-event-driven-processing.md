# Event-Driven Processing

Event envelope:

``` json
{
  "eventId":"uuid",
  "eventType":"finding.created",
  "schemaVersion":1,
  "tenantId":"uuid",
  "occurredAt":"timestamp",
  "correlationId":"uuid",
  "causationId":"uuid",
  "producer":"service",
  "payload":{}
}
```

Use at-least-once delivery with idempotent consumers, retries, DLQ,
replay, backpressure, priority, autoscaling, checkpoints and
poison-message handling.

Processing classes: interactive, async, batch, scheduled and
long-running workflow.
