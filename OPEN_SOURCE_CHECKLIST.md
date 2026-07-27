# Open-source release checklist

Use this checklist when publishing or materially updating the public repository. GitHub controls that only become available for a public repository must be enabled and verified immediately after the visibility change, before announcing the release. Items explicitly marked as recommended are follow-up safeguards rather than source-publication blockers.

## Legal and identity

- [x] Select an OSI-approved project license and add `LICENSE` plus package/README metadata: Apache-2.0.
- [x] Confirm the project operator and copyright holder: Byok.Chat.
- [x] Confirm the public legal/security contact: `support@byok.chat`.
- [ ] Recommended: have qualified counsel review the hosted-service privacy policy, terms, cookies policy, and chosen software license for the intended jurisdictions and business model.
- [x] Add an unaffiliated-provider trademark notice to the README.

## Repository hygiene

- [x] Remove local paths, temporary artifacts, private infrastructure names, deployment version identifiers, and agent-memory metadata from the public tree.
- [x] Decide whether to publish the existing history, rewrite it, or publish a clean source snapshot: publish one clean root commit and retain the prior history only in a local bundle.
- [x] Ensure the public release commit identity is intentional: Byok.Chat `<support@byok.chat>`.
- [x] Run Gitleaks across every ref that will become public.
- [ ] Confirm no unwanted branches, tags, releases, Actions artifacts, or repository variables will become public.

## Security and quality

- [ ] Run `npm ci`, `npm test`, and `npm run build` on every supported Node.js line.
- [x] Run production and development dependency audits.
- [x] Verify custom endpoint, redirect, rate-limit, attachment, error-redaction, consent, and security-header tests.
- [x] Review the threat model and public security policy.
- [x] Confirm the self-hosting example cannot target official BYOK Chat domains.

## GitHub controls

- [ ] Require pull requests and passing CI on `main`.
- [ ] Enable Dependabot alerts and security updates.
- [ ] Enable secret scanning and push protection.
- [ ] Enable CodeQL default or advanced setup.
- [ ] Enable private vulnerability reporting and subscribe maintainers to security alerts.
- [ ] Review Actions permissions and require immutable action SHAs where supported.

## Publication gate

- [ ] Review the exact public tree and repository metadata from a clean checkout.
- [ ] Obtain explicit approval to change visibility.
- [ ] Change visibility only after all required checks pass.
- [ ] Re-verify the public README, license detection, security-reporting path, CI, and hosted product links after publication.
