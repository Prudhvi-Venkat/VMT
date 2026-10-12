# Deployment & Disaster Recovery

Deployment modes: SaaS, customer-dedicated, private VPC, customer AWS
account and hybrid connectivity.

AWS baseline:
`CloudFront/WAF → Load Balancer/API → private application services → MongoDB`
with Redis, search, S3, queue/event infrastructure, KMS and managed
secrets.

Availability: Multi-AZ, automated failover, database replication,
cross-region backups, DR environment, queue/job recovery and graceful
degradation.

Every service defines RPO/RTO. DR is tested periodically. Infrastructure
is reproducible through versioned IaC.
