<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Frontend Contribution Guide

The frontend uses the Next.js App Router. Pages, layouts, route handlers, and feature entry points belong in `app/`; reusable presentation components belong in `components/`; shared types, API clients, state, risk logic, and adapters belong in `lib/`. Keep static assets in `public/` and avoid editing `.next/` or `node_modules/`.

Run `npm run dev` for local development, `npm run lint` for ESLint checks, `npm run build` for a production build, and `npm start` to serve that build. Run commands from `vm-app/`.

Use TypeScript for new code, two-space indentation, PascalCase for React components and types, camelCase for variables and functions, and descriptive kebab-case route directories. Prefer existing Radix/shadcn-style primitives under `components/ui` and shared helpers in `lib` before adding new abstractions. Keep loading, error, empty, and unauthorized states explicit. Do not expose secrets in client code; only intentionally public values may use `NEXT_PUBLIC_` variables.

For API or authentication changes, verify both the route handler and its backend contract. For UI changes, run lint and build, and include screenshots in the pull request when the visible behavior changes.
