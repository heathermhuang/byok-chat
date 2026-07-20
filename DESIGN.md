# BYOK Chat Design System

## Product Context

BYOK Chat is a standalone private AI workspace for people who bring their own provider keys. BYOK always expands to **Bring Your Own Key** at the first product touch. The product does not sell or resell model access; it connects provider accounts, access, and billing the user already controls.

The user should remember: **my provider, my account, my key**. This is serious chat software with a clear trust model, not a Sub2API admin screen, a generic LLM tester, or a marketing landing page.

Trust claims must distinguish storage from transit:

- Profiles, saved keys, and thread history are stored in the browser.
- Active credentials and request content pass through the BYOK Chat Cloudflare Worker in memory to the selected provider.
- The application does not intentionally create a server-side chat archive.
- Never imply that an active model request stays entirely on the device.

Primary references:

- Coinbase (primary): institutional calm, modest type weights, one scarce brand signal, and plain-language trust.
- Vercel (secondary): crisp developer surfaces, strong hairlines, restrained contrast, and technical clarity.

## Aesthetic Direction

- Direction: Trusted BYOK Workspace.
- Mood: calm, candid, precise, established, and chat-first.
- Brand personality: controlled, transparent, capable, and quietly confident. Never secretive, breathless, cute, or overpromising.
- Decoration: minimal and functional. Use warm white surfaces, hairlines, subtle elevation, compact command surfaces, and a single deep-evergreen brand signal. Do not use voice, audio, waveform, dark-shell, decorative blob, bokeh, stock imagery, pastel gradients, or gradient-hero treatments.
- Layout: two-zone desktop shell with a left profile rail and dominant center assistant workspace. Endpoint details open in a temporary drawer only when requested.

## Positioning and Voice

- First-touch expansion: `BYOK = Bring Your Own Key`.
- Product promise: `Use the AI provider account you already control.`
- Supporting proof: local saves, optional passphrase encryption, in-memory Worker transit, and no intentional server-side chat archive.
- Use plain ownership language: `your provider`, `your account`, `your key`, `saved in this browser`.
- Avoid vague claims such as `fully private`, `never leaves your device`, or `zero knowledge`.
- Trust is proven with specific mechanisms and links to the privacy policy and public security model, not shield decoration alone.

## Typography

Use local fonts only.

- UI and body: `"Avenir Next", "Segoe UI", Arial, sans-serif`.
- Display moments: use the same UI font at medium weight. Do not introduce a serif face.
- Data and IDs: `"JetBrains Mono", "SFMono-Regular", Consolas, monospace`.
- Weight ladder: regular `400`, medium `500`, semibold `600`. Do not use `700+` for UI, labels, badges, buttons, or cards.
- No viewport-scaled type.
- Letter spacing is always `0`.
- Display-sized type appears only in the setup intro and empty chat state.

## Color

Core shell:

- `--void` `#f5f3ef`: outer app background.
- `--rail` `#fbfaf7`: side rails.
- `--panel` `#ffffff`: setup and inspector panels.
- `--panel-2` `#f4f1eb`: lifted secondary surface.
- `--line` `rgba(41, 37, 36, 0.12)`: normal hairline.
- `--shell-ink` `#292524`: primary text on shell surfaces.
- `--shell-muted` `#706a61`: secondary text on shell surfaces.

Assistant canvas:

- `--canvas` `#ffffff`: conversation workspace.
- `--paper` `#ffffff`: message/composer cards.
- `--paper-2` `#f7f4ef`: inset control surface.
- `--ink` `#292524`: primary text.
- `--ink-muted` `#706a61`: secondary text.

Signals:

- `--brand` `#0d5b4d`: BYOK identity and first-touch trust signal.
- `--brand-strong` `#083f36`: primary actions and strong branded type.
- `--brand-soft` `#e7f2ef`: trust notes and selected surfaces.
- `--accent` `#0d5b4d`: model focus, active state, and focus rings.
- `--action` `#083f36`: provider setup and save actions.
- `--ready` `#0f8a70`: connected/ready state.
- `--warn` `#b7791f`: setup needed.
- `--danger` `#d92d20`: errors.

Use accent colors as operational signals, not decoration.

## Layout

Desktop:

- Fixed one-page shell: 236px profile rail and fluid assistant workspace.
- Header/status chrome stays under 72px.
- Chat owns the center after setup.
- Endpoint editing is one click away in a temporary drawer, but never a persistent ready-state rail.
- Setup uses a split launchpad: left progress/story panel, right provider/config panel.

Mobile:

- One column.
- Workspace setup or chat appears first; the compact profile rail follows below it.
- Endpoint details use a bounded drawer/bottom sheet instead of stacking a permanent diagnostics section.
- Secondary ready-state controls use a `More actions` dialog that traps focus, closes on Escape, and restores focus to its trigger.
- Touch targets are at least 44px.
- Long model/provider names truncate or wrap without pushing layout wider than the viewport.

## Components

- Radius: 4px, 6px, 8px. Do not use bubbly cards.
- Buttons use lucide icons when the action is standard.
- Provider presets are light command cards with compact provider glyphs and one metadata line.
- The product mark is a white key on deep evergreen. Do not place the acronym inside a decorative gradient tile.
- The brand lockup pairs `BYOK Chat` with the explicit descriptor `Bring Your Own Key`.
- Setup includes one concise trust note that tells users where the key is saved, how active requests transit the Worker, and that no server-side chat archive is intentionally created.
- Text-chat motifs are allowed when tied to real state: provider-to-model routes, prompt lines, cursor marks, sync bands, and mode labels.
- Ready-state status shows only real state: provider, mode, endpoint, model count, and capabilities in the header or explicit endpoint drawer.
- Message actions are context-specific and verified: copy, edit/retry/variation where supported, pending-media status, and explicit recovery actions for failed requests.
- Tool results disclose progressively: show a concise summary first and place raw request/response detail behind an explicit disclosure control.
- Chat composer is the strongest control in ready state.
- Empty chat state must look like an assistant surface, not a blank tester.

## Interaction

- Setup flow: provider, key, model.
- Setup CTA: `Save & connect`; ready-state CTA: `Save changes`.
- Ready flow: suggestions, thread, composer.
- Fetch models is a sync action, not required for manual model IDs.
- Web tools remain a clear toggle and stay disabled when unsupported.
- Motion is subtle and disabled under `prefers-reduced-motion`.

## Do Not

- Do not let configuration dominate the chat.
- Do not add fake metrics, fake action buttons, or fake observability.
- Do not add Sub2API auth, routes, sidebar, or build coupling.
- Do not add external font imports.
- Do not turn this into a marketing landing page.
- Do not use a dark shell, dark rails, or dark chat bubbles.
- Do not use purple gradient SaaS defaults.
- Do not display `BYOK` without expanding it at a first-touch product surface.
- Do not conflate browser-local storage with request transit through the Worker.
