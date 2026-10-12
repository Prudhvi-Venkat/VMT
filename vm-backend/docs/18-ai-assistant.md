# AI Assistant

Initial AI is read-only.

Use cases: natural-language security questions, finding explanations,
vulnerability summaries, risk explanations, investigation assistance and
remediation recommendations.

Guardrails: - inherit user authorization - never retrieve outside
authorized scope - no remediation execution - audit AI
requests/actions - redact sensitive data - validate prompts/input -
indicate uncertainty - prefer source-backed answers - preserve tenant
isolation

The design may later support MCP/agent capabilities, but initial
implementation must not depend on autonomous write-capable agents.
