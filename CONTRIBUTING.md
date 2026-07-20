# Contributing to BYOK Chat

Thank you for helping improve BYOK Chat. Changes should preserve its core boundary: a dependency-light, browser-local BYOK workspace served by a Cloudflare Worker.

## Before you start

- Read [SECURITY.md](SECURITY.md) before reporting anything involving credentials, private data, or a possible vulnerability.
- Read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
- Search existing issues before opening a new one.
- Do not use real API keys, private provider endpoints, production prompts, or user data in tests, screenshots, fixtures, commits, or issues.

## Development setup

Requirements:

- Node.js `20.19+`, `22.12+`, or `24+`;
- npm; and
- a Cloudflare account only if you are testing your own Worker deployment.

```bash
nvm use
npm ci
npm test
npm run build
```

`npm run dev` builds the app and starts a local Worker. Local Worker development is resource-heavy, so use it only for behavior that unit and build checks cannot validate.

## Architecture boundaries

- Keep profiles, threads, and saved credentials browser-local.
- Route provider traffic through the allowlisted API paths in `src/worker.ts`.
- Do not add authentication, admin routes, or build coupling from unrelated products.
- Treat provider endpoints, prompts, attachments, and tool output as untrusted input.
- Do not add a dependency when a small platform-native implementation is sufficient.

See [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for the trust boundaries that changes must preserve.

## Pull requests

1. Create a focused branch from the current default branch.
2. Add or update tests for behavior changes.
3. Run `npm test`, `npm run build`, and `git diff --check`.
4. Explain user impact, security/privacy impact, and verification evidence in the pull request.
5. Keep production deployment credentials and official-domain operations out of the pull request.

Contributors must not deploy to `byok.chat`, `www.byok.chat`, or `staging.byok.chat`. Use the self-hosting configuration described in the README for deployment experiments.

By submitting a contribution, you confirm that you have the right to submit it and agree that it may be distributed under the repository's license.
