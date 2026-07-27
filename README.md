# BYOK Chat

BYOK means **Bring Your Own Key**. BYOK Chat lets you use keys from AI provider accounts you control in one private workspace. It does not sell or resell model access, and it does not add a model subscription between you and your provider.

The workspace supports official providers, OpenRouter, custom OpenAI-compatible endpoints, persistent local threads, comparison, usage visibility, permissioned web tools, and in-thread media generation.

The hosted product is available at [byok.chat](https://byok.chat).

## Security and privacy model

Profiles, saved credentials, and thread history live in browser storage. A provider key can be stored as ordinary browser data or encrypted locally with a passphrase. The passphrase is not saved.

Active prompts, context, attachments, endpoint settings, and credentials pass through the Cloudflare Worker in memory so it can call the provider selected by the user. The application does not intentionally create a server-side chat archive.

Read [the security model](docs/SECURITY_MODEL.md) before self-hosting or changing request routing. Report vulnerabilities privately according to [SECURITY.md](SECURITY.md).

## Features

- OpenRouter, OpenAI, Anthropic, MiniMax, Z.ai, DeepSeek, Gemini, xAI, and custom OpenAI-compatible endpoints;
- browser-local profiles, workspaces, encrypted keys, and persistent threads;
- model discovery with a typed-model fallback;
- chat, image generation, image editing, and video generation;
- image, PDF, text, CSV, JSON, audio, and video attachments;
- comparison across saved profiles;
- permissioned search and public-URL reader tools;
- usage, latency, token, and approximate known-model cost metadata; and
- consent-gated, page-level analytics on the official hosted service.

## Architecture

- `src/App.tsx` and `src/components/`: React workspace UI;
- `src/lib/`: browser-local profiles, threads, storage, tools, and provider metadata;
- `src/worker.ts`: Cloudflare Worker API proxy and security boundary;
- `test/`: Node unit and integration tests;
- `scripts/browser-smoke.mjs`: Worker-backed browser smoke suite; and
- `wrangler.example.toml`: safe starting point for a self-hosted Worker.

Provider requests are limited to the model, chat, image, and video paths implemented in `src/worker.ts`. Credential-bearing redirects are rejected. Custom endpoints must use HTTPS and public hosts.

## Local development

BYOK Chat supports Node.js `22.22.2+` on the Node 22 line, `24.15.0+` on the
Node 24 line, and Node.js `26+`.

```bash
nvm use
npm ci
npm test
npm run build
```

To start a local Worker when unit and build checks are insufficient:

```bash
npm run dev
```

This builds the React app and starts `wrangler dev --local` on port `8799`. Set `PORT=8801` or another available port when necessary. A plain static server can render the interface, but provider and tool routes under `/api/*` require the Worker.

## Self-hosting on Cloudflare

Create a deployment-specific Wrangler file; do not edit or reuse the official production configs:

```bash
cp wrangler.example.toml wrangler.local.toml
```

Choose a unique Worker name and unique positive numeric rate-limit namespace IDs in `wrangler.local.toml`. Keep `global_fetch_strictly_public` enabled and do not add VPC or private-network bindings.

Set the public legal identity at build time:

```bash
VITE_OPERATOR_NAME="Your legal operator name" \
VITE_LEGAL_CONTACT_EMAIL=privacy@example.com \
npm run deploy:self-hosted
```

`VITE_*` values are compiled into the public browser bundle and must never contain secrets. Add optional Worker-side search credentials with Cloudflare secrets instead:

```bash
npx wrangler secret put JINA_API_KEY --config wrangler.local.toml
```

Self-hosters are responsible for their domains, Cloudflare settings, legal notices, analytics configuration, provider terms, security response, and privacy compliance.

## Official release process

The tracked `wrangler.toml` and `wrangler.staging.toml` files target the official BYOK Chat domains and are for maintainers only. Contributors must not deploy to those domains.

The official hosted service is operated by Heatherm Huang. Public legal and privacy correspondence goes to [heathermhuang@gmail.com](mailto:heathermhuang@gmail.com). Those public build-time values live in `.env.official`; self-hosters must provide their own identity instead of using that file.

Maintainer staging deployment:

```bash
npm run verify:official-env
npm run deploy:staging
BYOK_CHAT_BASE_URL=https://staging.byok.chat/ npm run test:browser
```

Production requires explicit approval and the gates in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md). `npm run release:assets` compares the staging and production HTML and asset hashes.

## Privacy and analytics

The official service publishes privacy, terms, and cookie pages at `/privacy`, `/terms`, and `/cookies`. Google Analytics is not requested until the visitor opts in. Advertising storage, advertising user data, advertising personalization, and Google Signals remain disabled.

Production `byok.chat` and `www.byok.chat` use GA4 property `G-GJRR7KP2G1`; localhost and staging stay analytics-free unless a build explicitly supplies `VITE_GA_MEASUREMENT_ID`. Analytics events exclude query parameters, prompts, thread content, profile names, model IDs, API keys, and form values.

Analytics cookies are scoped to the current hostname. Withdrawing consent sends a denied consent update and deletes both current-host and legacy parent-domain GA cookies accessible to the official service.

Operators must provision and test the displayed privacy mailbox, identify the responsible person or legal entity, and obtain qualified legal review for their jurisdictions and business model.

## License

BYOK Chat is licensed under the [Apache License 2.0](LICENSE). Copyright 2026 Heatherm Huang.

The license does not grant rights to BYOK Chat names, logos, or branding except as required to describe the software's origin.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Bug reports and pull requests must use synthetic content and test credentials only.

Provider names and marks belong to their respective owners. BYOK Chat is an independent project and is not endorsed by or affiliated with the providers listed in the interface.
