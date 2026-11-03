# Test key → selected-model chat: staging receipt

Target: https://staging.byok.chat

Staging Worker: `byok-chat-staging`

Deployed version: `1fbc08b1-5367-43c3-b4c0-494e24b8988f`

Rollback target recorded before this work: `f6cb15b1-4682-4906-b509-0296b193c7ea`

Source baseline: current main `6882a285f5743d939c11b96b3fc6fb538ae307f6`. Implementation is in isolated branch `codex/test-key-then-chat-20261103`, preserving the original checkout's unrelated staged work.

## Implemented behavior

- The first-run workspace exposes provider, endpoint, masked key, model discovery and selection, then an explicit small chat test.
- Model discovery and chat permission are displayed separately. Only a successful Chat endpoint probe yields the model-specific Chat action; aggregate `ok`, quota warnings and a successful model list do not.
- A passing result is held only in session memory and belongs to a specific profile, provider, normalized endpoint, key and selected model. Changes invalidate it immediately and abort pending tests. Late results are discarded.
- Chat uses the same selected model and credential, retains a scoped test receipt and focuses the composer after the handoff.
- Manual-model providers remain supported. Saved profiles can still open their normal workspace; this does not fabricate a successful test receipt.
- Existing chat, model controls, tools, media, privacy and legal surfaces remain available.

## Verification

- Unit tests: 153 passed, zero failures.
- Official public-environment validation, TypeScript/Vite build, deploy dry run and diff checks passed.
- Full repository browser smoke passed against staging, including model loading, manual/empty-model fallback, chat, error recovery, media, consent and legal routes.
- Focused deployed-browser tests passed at 1440px, 390px and 320px: fetch models, choose a different returned model, run test, open that same model, send a message, and render the reply.
- Additional checks covered manual model entry at 768px; profile/model/key/endpoint invalidation; quota-warning rejection; and late-response cancellation at 1180px.
- Visual review corrected mobile header crowding and the active profile's model label during editing.
- Served staging HTML, CSS, main JS and lazy chat JS matched the locally verified build byte-for-byte.

Asset paths:

- `/assets/index-DFik1gpb.js`
- `/assets/index-D6NKqQYc.css`
- `/assets/ByokAssistant-CEnu_ZtL.js`

Local receipts and screenshots: `/tmp/byok-test-key-chat-evidence/`, `/tmp/byok-key-chat-full-browser.log`, `/tmp/byok-key-chat-unit.log`, and `/tmp/byok-test-key-chat-deploy.log`.

The browser cases use synthetic credentials and intercepted provider responses. They verify the deployed app's UI and request binding; they do not establish entitlement or reliability for a real provider key. Worker diagnostics still use the existing allowlisted server API. No production deployment was performed.
