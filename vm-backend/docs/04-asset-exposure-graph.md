# Asset & Exposure Graph

## Node types

Asset, identity, vulnerability, finding, software package, SBOM, cloud
resource, control, application, service, data resource, network segment,
repository, container image.

## Relationships

OWNS, RUNS, CONTAINS, DEPENDS_ON, EXPOSED_TO, CONNECTS_TO,
AUTHENTICATES_TO, CAN_ACCESS, ASSUMES_ROLE, AFFECTED_BY, EVIDENCED_BY,
PROTECTED_BY, HOSTED_ON, BUILT_FROM, DEPLOYED_AS, BELONGS_TO, ROUTES_TO.

Relationships are temporal. Attack-path analysis can connect Internet
exposure → service → vulnerable asset → privileged identity → sensitive
resource.

Path results retain the evidence and graph snapshot used for assessment.
