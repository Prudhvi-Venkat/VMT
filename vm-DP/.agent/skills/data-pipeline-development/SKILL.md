---
name: data-pipeline-development
description: "Develop, validate, and safely operate the vm-DP vulnerability-intelligence pipeline."
---

## Use this skill when

- Changing stages 01–07, `pipeline_runner.py`, feed parsing, enrichment, analytics, or vendor synchronization.
- Modifying MongoDB documents, indexes, provenance, or generated dataset formats.

## Workflow

1. Read `vm-DP/AGENTS.md` and identify the affected stage and downstream consumers.
2. Preserve stage ordering, environment-variable behavior, idempotency, and source provenance.
3. Prefer bounded runs with `PIPELINE_START_STAGE` and `PIPELINE_END_STAGE`.
4. Validate output schemas, counts, duplicate handling, and MongoDB writes using safe local data.
5. Document contract or operational changes and report the exact validation command.

## Safety

- Do not commit secrets, credentials, or bulk feed artifacts.
- Do not manually edit files under `downloads/`; regenerate them from their sources.
- Never silently discard conflicting security observations or historical evidence.
- Avoid full network refreshes unless explicitly required; use metadata checks and bounded stages first.
- Treat MongoDB connection and write failures as actionable errors, not successful empty runs.
