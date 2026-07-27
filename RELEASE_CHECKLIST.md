# BYOK Chat Release Checklist

Production stays untouched until the user explicitly approves a production deploy.

## State Labels

- Local: files in this checkout, not deployed.
- Staging: `https://staging.byok.chat`, deployed with `wrangler.staging.toml`.
- Production: `https://byok.chat`, deployed with `wrangler.toml`.

## Before Staging

1. Run `npm test`.
2. Run `npm run build:official`.
3. Run `npm run verify:official-env`. Official deployment scripts enforce this gate and use `.env.official` automatically.
4. Confirm `.env.official` still identifies `Byok.Chat` and points to the monitored `support@byok.chat` mailbox.
5. Confirm production is still intended to use GA4 property `G-GJRR7KP2G1`. Provide `VITE_GA_MEASUREMENT_ID` only when validating a separate staging property or intentionally overriding production. Confirm the property uses no Google Signals or ads linkage and retains event-level data for no more than 14 months.
6. Have qualified counsel review `/privacy`, `/terms`, and `/cookies` for the operator, target markets, provider relationships, and any paid-service terms.
7. Check `git status --short` and keep unrelated work out of the release notes.
8. Write down the intended staging change and rollback target.

## Staging Deploy And Smoke

1. Deploy staging only: `npm run deploy:staging`.
2. Smoke staging with `BYOK_CHAT_BASE_URL=https://staging.byok.chat npm run test:browser`.
3. Confirm setup, encrypted unlock, manual model fallback, chat, model fetch, permissioned tools, retry/variation/edit actions, undo for destructive thread actions, diagnostics, compare, and media surfaces relevant to the change.
4. Open `/privacy`, `/terms`, and `/cookies` directly and confirm each returns the correct page after a hard refresh.
5. In a fresh browser context, confirm no request to `googletagmanager.com` or `google-analytics.com` occurs before consent or after choosing Necessary only.
6. Allow analytics and confirm exactly one page view without query parameters, prompt text, profile names, model IDs, thread titles, form values, or API keys. Revoke consent and confirm GA cookies are removed.
7. Check the sidebar and setup flow at 320px, 768px, 1180px, and a wide desktop size for clipped or overflowing text.
8. Record the staging Worker version or deploy output.

## Production Diff Check

1. Run `npm run release:assets`.
2. If it prints `MATCH`, staging and production currently serve the same HTML and built asset hashes.
3. If it prints `DIFF`, inspect the listed asset paths before deciding whether production should move.
4. Do not deploy production from this checklist unless the user explicitly approves it.

## Rollback Notes

- Roll back staging by redeploying the previous known-good commit to `wrangler.staging.toml`.
- Roll back production only after explicit approval, using the last known-good production commit or Worker version.
- Keep the final report split into local, staging, and production status.
