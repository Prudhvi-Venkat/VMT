# Finding Lifecycle

Default flow:
`New → Triaged → Validated → Assigned → Remediation Planned → In Progress → Mitigated/Remediated → Verification → Resolved → Closed`

Additional states: False Positive, Accepted Risk, Suppressed, Deferred,
Reopened.

Transitions are policy-controlled. Risk acceptance requires configured
approval and expiration. Verification can use scanner, agent or manual
evidence. Reopening policies react to new evidence. Every transition is
audited.
