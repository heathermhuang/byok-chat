# BYOK Chat security model

## System overview

BYOK Chat is a Vite React application served by a Cloudflare Worker. Profiles and conversation history are stored in the browser. The Worker receives active requests, forwards them to the provider selected by the user, and returns the result without creating a server-side chat archive.

```text
Browser workspace
  -> BYOK Chat Worker
     -> selected AI provider
     -> Jina or a configured search service when a tool is explicitly allowed

Browser
  -> Google Analytics only after analytics consent
```

## Sensitive data

- Provider and search API keys;
- optional local-encryption passphrases;
- prompts, thread context, attachments, and model output;
- provider base URLs and selected models; and
- IP address and request metadata processed by hosting infrastructure.

## Trust boundaries

### Browser storage

Profiles and threads are browser-local. A provider key may be stored as ordinary browser data or encrypted with AES-GCM using a passphrase-derived key. The passphrase is not persisted. Browser extensions, malware, shared browser profiles, and physical device access remain part of the user's endpoint-security responsibility.

### Worker transit

The active provider key and request content pass through the Worker in memory. Application code does not intentionally persist request bodies or create a server-side conversation archive. Operators must not add request-body logging, analytics fields containing workspace data, or broad observability exports without a separate privacy and security review.

### Provider and tool services

The user-selected provider receives credentials and request content. Search and reader services receive only the query or public URL needed for a tool call when that tool is explicitly allowed. Provider behavior, retention, model output, and account security are outside BYOK Chat's control.

## Implemented controls

- HTTPS-only provider endpoints with embedded credentials rejected;
- literal local, private, link-local, multicast, and reserved hosts rejected;
- Cloudflare `global_fetch_strictly_public` routing for global `fetch()`;
- allowlisted provider paths for models, chat, image, and video operations;
- credential-bearing redirects rejected;
- explicit tool permissions and untrusted-source fencing;
- attachment count and size limits;
- per-client API and media-status rate limits;
- sanitized provider errors and `no-store` API responses;
- CSP, HSTS, clickjacking protection, referrer policy, permissions policy, and MIME-sniffing protection;
- local encryption and redacted profile exports; and
- consent-gated analytics that excludes query strings and workspace fields.

## Deployment requirements

- Do not bind this Worker to a VPC Service, VPC Network, private Cloudflare Tunnel, or other private-network egress path.
- Keep `global_fetch_strictly_public` enabled.
- Keep provider paths allowlisted and credential-bearing redirects disabled.
- Configure both rate-limit bindings on every public deployment.
- Store Worker secrets with Cloudflare secret bindings, never `VITE_*` variables or committed configuration.
- Keep analytics disabled unless a valid consent flow and accurate legal notice are present.
- Review Cloudflare logs and integrations so request bodies, authorization headers, and provider responses are not exported.

Hostname checks cannot prove what every future DNS answer will be. Strict-public Worker routing and the prohibition on private-network bindings are therefore part of the SSRF boundary, not optional deployment preferences.

## Non-goals

BYOK Chat does not protect against:

- a compromised browser, device, extension, operating system, or provider account;
- a user intentionally sending credentials to an endpoint they control;
- provider-side retention, training, moderation, billing, or availability decisions;
- unsafe model output; or
- security changes made by third-party forks or self-hosters.

## Verification

The repository includes regression tests for private-host rejection, HTTPS enforcement, redirect handling, error redaction, attachment limits, tool permissions, analytics gating, security headers, and rate-limit responses. Public CI also runs the unit suite, production build, deployment-config dry-runs, dependency audit, secret scan, and CodeQL analysis.
