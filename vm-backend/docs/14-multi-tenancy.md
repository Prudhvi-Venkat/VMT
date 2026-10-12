# Multi-Tenancy

Configurable hierarchy such as:
`Organization → Business Unit → Account/Subscription → Environment → Application/Service → Asset`

Isolation tiers: 1. Shared infrastructure/database with strict
partitioning 2. Dedicated database 3. Dedicated environment

Tenant context is mandatory in requests, jobs, events, caches, searches
and object paths. Cross-tenant operations require explicit elevated
authorization.
