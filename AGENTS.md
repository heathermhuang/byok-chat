# AGENTS.md

This is a standalone Byok Chat app, separate from `grok2api` and `sub2api`.

Keep it dependency-light unless a feature clearly needs a framework. The app is a Vite React frontend served by a Cloudflare Worker in `src/worker.ts`.

Do not add Sub2API auth, routes, sidebar, or build-system coupling here. Provider calls should go through the allowlisted Cloudflare Worker API in `src/worker.ts`.

## Deployment

Do not deploy or serve this app locally by default. Local dev servers are resource-heavy for this project.

Use `staging.byok.chat` for staging deployments and QA. Only deploy to `byok.chat` after the user explicitly says it is OK.

## Public analytics

Public page statistics must start automatically and passively, without an opt-in
requirement or initial analytics prompt. Preserve explicit opt-outs, sensitive
content exclusions, production-host isolation and query-free Google execution.
Verify first-visit collection with the real Google tag and intercepted requests.
