# BYOK Chat Design System

## Product Context

BYOK Chat is a standalone private model workspace for people who bring their own provider keys. It is not a Sub2API admin screen, not a generic LLM tester, and not a marketing page.

The user should remember: this is serious chat software that happens to make endpoint setup fast.

Primary references:

- ElevenLabs UI: warm off-white component-library canvas, ink-first CTAs, compact component rhythm, editorial restraint.
- Vercel: crisp light developer surfaces, strong hairlines, restrained contrast, technical clarity.
- Raycast: command-palette density, keyboard-tool atmosphere, product UI as the visual language.

## Aesthetic Direction

- Direction: Light Agent Workspace.
- Mood: warm, precise, technical, premium, and chat-first.
- Decoration: intentional only. Use hairline grids, subtle elevation, compact command surfaces, text-session motifs, and tiny pastel status signals. Do not use voice, audio, waveform, dark-shell, decorative blob, bokeh, stock imagery, or gradient-hero treatments.
- Layout: two-zone desktop shell with a left profile rail and dominant center assistant workspace. Endpoint details open in a temporary drawer only when requested.

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

- `--accent` `#292524`: model focus, active state, focus rings.
- `--action` `#0c0a09`: provider setup and save actions.
- `--ready` `#16a34a`: connected/ready state.
- `--warn` `#b7791f`: setup needed.
- `--danger` `#d92d20`: errors.
- Pastel accents: mint `#a7e5d3`, peach `#f4c5a8`, lavender `#c8b8e0`, sky `#a8c8e8`, rose `#e8b8c4`. Use only for small text-session and state visuals, never as CTA fills.

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
- Profile rail appears first but remains compact.
- Chat/setup follows immediately.
- Endpoint details use a bounded drawer/bottom sheet instead of stacking a permanent diagnostics section.
- Touch targets are at least 44px.
- Long model/provider names truncate or wrap without pushing layout wider than the viewport.

## Components

- Radius: 4px, 6px, 8px. Do not use bubbly cards.
- Buttons use lucide icons when the action is standard.
- Provider presets are light command cards with compact provider glyphs and one metadata line.
- Text-chat motifs are allowed when tied to real state: provider-to-model routes, prompt lines, cursor marks, sync bands, and mode labels.
- Ready-state status shows only real state: provider, mode, endpoint, model count, and capabilities in the header or explicit endpoint drawer.
- Message actions only show verified controls: copy and regenerate.
- Chat composer is the strongest control in ready state.
- Empty chat state must look like an assistant surface, not a blank tester.

## Interaction

- Setup flow: provider, key, model.
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
