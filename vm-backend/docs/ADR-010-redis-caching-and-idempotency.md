# ADR-010: Redis Caching, Idempotency, and High-Throughput Read Acceleration

## Decision

The backend utilizes Redis (`ioredis`) for high-throughput caching, API rate limiting, session acceleration, and distributed idempotency locking, with graceful in-memory fallbacks when Redis is not provisioned.

- **Tenant-Prefixed Keys**: Every key stored in Redis strictly conforms to the pattern `tenant:{tenantId}:{resourceType}:{identifier}` (or `platform:{resourceType}:{identifier}` for platform-scoped entities). This upholds AGENTS.md Rule 1.
- **Cache Targets & TTLs**:
  - `tenant:{t}:session:{tokenHash}` — TTL equal to session expiration
  - `tenant:{t}:user:{userId}` — TTL 5 minutes (invalidated on user update/lock)
  - `tenant:{t}:dashboard:summary:{scope}:{id}` — TTL 60 seconds (invalidated on scan completion)
  - `platform:vuln_intel:{cveId}` — TTL 1 hour
- **Idempotency Locks**: Large workloads (scans, batch imports) acquire distributed locks via Redis `SET key val NX PX <ms>` to ensure deduplication and idempotent processing.
- **Fail-Open / Memory-Fallback Strategy**: If Redis is unavailable, the application gracefully routes through an in-memory TTL cache without dropping user requests or failing scans.
