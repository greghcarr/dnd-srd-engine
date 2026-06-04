# Web demo

GitHub Pages demo for `dnd-srd-engine`. Plain TypeScript + Vite, no framework. Two panels: Fuzz Replay (left), Event Inspector (right).

Slice 600 retired the prior user-controlled Combat Sandbox. The demo now runs the same randomized battle the [`scripts/combat-fuzz` CLI](../scripts/combat-fuzz.ts) produces and lets the user scrub forward and back through the committed event stream — the initiative panel and the event inspector follow the cursor automatically.

Plan and architecture decisions live in [docs/web-demo-plan.md](../docs/web-demo-plan.md). When something here disagrees with the plan, update the plan doc before changing course.

## Running

```bash
npm install
npm run dev:web      # local dev server with engine source aliased
npm run build:web    # production bundle to dist-web/ (uses dist/ — run `npm run build` first)
npm run preview:web  # serve the production bundle locally
```

The dev alias maps `dnd-srd-engine` and `dnd-srd-engine/starter-pack` to local `src/`, so engine edits hot-reload into the demo. The demo also imports the simulation core from [`scripts/combat-fuzz-core.ts`](../scripts/combat-fuzz-core.ts) so the same code drives both the CLI transcript-writer and the browser replay. Production bundles import from the built `dist/`, so the deployed demo runs the same code an npm consumer would.

## Deploying

Pushes to `main` trigger [.github/workflows/deploy-demo.yml](../.github/workflows/deploy-demo.yml), which builds `dist-web/` and uploads it as a GitHub Pages artifact. No build output is committed to the repo.

The workflow self-enables Pages on first run via `actions/configure-pages@v5`'s `enablement: true`, so no manual Settings click is needed. If you'd rather configure it by hand: Settings → Pages → **Source = "GitHub Actions"**.

## URL hash

- `seed=42` — fuzz seed. Same number, same battle, byte-for-byte.
- `mode=1v1` or `mode=2v2` — team size.
- `vs=pc` (default) or `vs=monster` — fight other PCs or low-CR monsters.
- `level=1..5` — characters level up via the engine's level-up planner; choices auto-resolved to the first option.
- `rest=none|short|long` — perform a post-battle rest so the transcript covers recharge events too.
- `step=N` — cursor position. Omitted when at the end; reflects current scrub when not.

Editing the hash directly (back/forward, paste) re-runs the battle or re-seeks the cursor as appropriate. The Run button rebuilds the session from whatever values are in the toolbar inputs.

## Transport controls

The Fuzz Replay panel exposes ⏮ ⏪ ▶ ⏩ ⏭ — jump to start, step back, play/pause auto-advance, step forward, jump to end. Auto-advance ticks one event every 350 ms. The cursor display shows `step N / total`.

The initiative panel and event inspector subscribe to the same `EngineHost`; every scrub triggers `replay(events.slice(0, cursor))` and both panels re-render against that slice. `Verify replay` in the inspector works at any cursor.

## PendingChoice reachability

The Pending Choice Resolver panel ([web/ui/pending-choice.ts](ui/pending-choice.ts)) is built generically — it handles every choice the engine emits via the uniform `PendingChoice = {prompt, options, oneOf, forCharacterId}` shape.

The fuzz simulator auto-drains pending choices during level-up to keep its harness deterministic, so the resolver rarely appears in the demo. It ships anyway so any future mode (Character Forge, interactive scenarios, level-up demos) gets a working UI for free. If you mount a new mode that triggers a choice and the resolver doesn't render the right widget for it, fix the resolver — don't write a per-mode resolver.

## Layout slots

- `#fuzz-replay-root` — left panel, rendered by [modes/fuzz-replay.ts](modes/fuzz-replay.ts)
- `#event-inspector-root` — right panel, rendered by [modes/event-inspector.ts](modes/event-inspector.ts)
- `#pending-choice-root` — full-width banner above the panels, only visible when there's an unresolved `PendingChoice`

## What's intentionally not here

- React/Preact/Lit. The event loop maps cleanly to "re-render everything from state after each scrub"; framework reconciliation buys nothing.
- A router. State (seed, mode, vs, level, rest, step) lives in the URL hash.
- Analytics or auth.
- Imported content beyond `loadStarterPack()`. The demo isn't a content authoring surface.
- User-controlled actions. The demo is a fuzz viewer; for interactive play, use the engine API directly (see [examples/02-combat-encounter](../examples/02-combat-encounter/) for a code walkthrough).
