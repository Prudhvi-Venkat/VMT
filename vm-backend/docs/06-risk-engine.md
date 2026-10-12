# Contextual Risk Engine

Inputs can include severity, EPSS, KEV/exploitation, asset criticality,
Internet exposure, business importance, data sensitivity, privilege,
reachability, compensating controls, environment, threat intelligence,
finding age and SLA state.

`Signals → normalized factors → hierarchical policy → weighted calculation → thresholds → score/band → explanation`

Every assessment stores policy ID/version, input snapshot, calculation
version, score and explanation.

Policy hierarchy: global → tenant → business unit → application/service
→ environment/asset. Specific policy overrides must be explicit and
auditable.
