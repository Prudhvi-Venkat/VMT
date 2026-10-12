# Authorization

Combine RBAC, ABAC and resource-level policies.

Decision input: authenticated principal + tenant context + resource +
action + attributes + policy set.

Rules: deny by default, explicit tenant scope, resource ownership
checks, environment/BU restrictions, separation of duties, delegated
administration, scoped service accounts and audit of sensitive
decisions.

Server-side authorization is mandatory for every protected operation.
