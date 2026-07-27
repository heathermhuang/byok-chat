# Security policy

BYOK Chat handles provider credentials and request content in transit, so security reports are treated as sensitive.

## Supported versions

Security fixes target the latest commit on the default branch and the current deployment at `https://byok.chat`. Older commits, forks, and modified self-hosted deployments are not maintained by the BYOK Chat maintainers.

## Reporting a vulnerability

Do not open a public issue or pull request for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow at:

`https://github.com/heathermhuang/byok-chat/security/advisories/new`

If GitHub private reporting is unavailable, email `support@byok.chat` with `[BYOK Chat security]` in the subject. Do not include live credentials or private prompt content in the first message.

Include:

- the affected route, component, or commit;
- the impact and realistic attack scenario;
- minimal reproduction steps;
- whether any real credential or personal data may have been exposed; and
- a suggested remediation, if you have one.

Use test credentials and synthetic content whenever possible. Never attach a live provider key, passphrase, prompt history, or another person's data to a report.

We aim to acknowledge reports within five business days. We will coordinate remediation and disclosure timing with the reporter based on severity and user impact.

## High-priority report areas

- API-key exposure in browser storage, logs, analytics, exports, or error messages;
- cross-site scripting or script-policy bypasses that could read local workspace data;
- server-side request forgery or private-network access through custom endpoints or tools;
- provider credential forwarding to an unintended origin or redirect target;
- bypasses of attachment limits, tool permissions, rate limits, or consent gating; and
- vulnerable dependencies with a practical impact on the hosted application.

## Security model

The public trust boundaries, deployment requirements, and non-goals are documented in [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md).

Self-hosters are responsible for their own Cloudflare account, domains, secrets, logging, private-network bindings, legal notices, and incident response.
