---
name: frontend-development
description: "Develop and validate frontend features in the vm-app Next.js and TypeScript application."
---

## Use this skill when

- Adding or changing App Router pages, route handlers, React components, or frontend state.
- Integrating UI behavior with the vulnerability-management backend.
- Updating shared TypeScript types, API clients, risk views, SBOM views, or authentication flows.

## Workflow

1. Read `vm-app/AGENTS.md` and inspect the owning route, component, and `lib` helpers.
2. Reuse existing UI primitives and types before introducing new abstractions.
3. Keep server/client boundaries explicit and preserve authentication and authorization behavior.
4. Implement loading, error, empty, and unauthorized states.
5. Run `npm run lint` and `npm run build` from `vm-app/`.

## Safety

- Never expose secrets or private backend configuration in client bundles.
- Use `NEXT_PUBLIC_` only for values intended to be public.
- Do not edit `.next/` or `node_modules/`.
- Coordinate API contract changes with `vm-backend` and update documentation when behavior changes.
