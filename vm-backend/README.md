# Enterprise Security Exposure Platform

A unified enterprise platform for asset intelligence, vulnerability
intelligence, security findings, contextual risk, attack paths,
remediation workflows, cloud exposure, software/SBOM intelligence and
controlled automation.

**Baseline:** Next.js frontend; Node.js + Express.js backend; MongoDB
operational database; Redis cache; OpenSearch/Elasticsearch-compatible
search; object storage; queues/event streams; OpenTelemetry;
AWS-oriented hybrid deployment.

## Documentation

See `DOCUMENT_INDEX.md`. `AGENTS.md` is mandatory for AI coding agents.

## Architectural principle

External tools are data sources, not authoritative owners of the entire
security model. The platform creates canonical identities, preserves
provenance, correlates evidence, calculates explainable risk and manages
lifecycle/remediation.
