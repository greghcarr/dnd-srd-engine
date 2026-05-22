# Web Demo Plan — `dnd-srd-engine`

A browser-based test harness for the engine, deployed to GitHub Pages. Single-page app, plain TypeScript + Vite, no UI framework.

**Status**: v1 shipped. The Combat Sandbox, Event Inspector, Rules Lab, Scenario Gallery, and Map Panel all run live at https://greghcarr.github.io/dnd-srd-engine/. The active reference for running and extending the demo lives in [web/README.md](../web/README.md). This doc preserves the design rationale and non-goals for future contributors deciding whether to add a new mode.

---

## Goals

- Let a visitor verify the engine works correctly in their browser within ~30 seconds of arriving.
- Make the engine's load-bearing invariants (event sourcing, plan/commit, captured RNG, deterministic replay) **visible**, not just claimed.
- Double as a debugging surface for the maintainer when iterating on the engine.
- Be cheap to maintain: no backend, no analytics, no auth, no per-user state.

## Non-goals

- Not a polished D&D game. No narrative, no art, no sound, no immersive combat UX. The Event Inspector being visible alongside Combat Sandbox is a feature, not a bug.
- Not a content authoring tool. Use the starter pack only; do not build a content editor.
- Not a level-20 showcase. Gate level selection at 5 (the realistic ceiling of the starter pack) and put a banner in Character Forge explaining the limit.
- Not a replacement for the test suite. CI is still the source of truth for correctness; the demo is for human verification and showcase.
- Not a multi-system thing. Scoped to D&D 5.5e via the existing engine, no Phase F extraction work.

---

## Scope: v1 ships two modes

### 1. Combat Sandbox

Pre-built two-sided encounter (a new `goblin-skirmish.ts` scenario authored for the demo — see **Implementation notes** for why this isn't a port from `tests/golden/`). User can:

- Roll initiative
- Take turns: Attack / Cast Spell / Move / Dash / Dodge / End Turn
- See live HP, conditions, action economy state on each combatant
- See dice rolls inline as they happen (with captured d20 and damage dice visible)
- Resolve `PendingChoice` events when they arise (spell targets, etc.)
- Reset the encounter (re-seeds the RNG to a known value)

### 2. Event Inspector (rendered side-by-side with Combat Sandbox)

Right-hand panel showing the live event stream from the campaign. Each event:

- Type, timestamp, payload preview
- Click to expand full JSON
- Color-coded by category (resolution / state-change / record-only)

At the bottom: an "Export event log" button (downloads JSON) and an "Import event log" button (replays it from scratch and asserts byte-identical state, displaying ✓ or ✗ with diff on failure). This is the demo's headline correctness claim made interactive.

### Out of scope for v1 (defer)

- Character Forge (a sheet builder)
- Seeded Encounter (canned scenarios with seed picker)
- Replay Theater (step-forward/backward scrubber)
- Transcript Viewer (rendering the golden transcripts)

Ship v1, see if anyone uses it, then decide.

---

## Architecture decisions

These are settled. Re-open only if implementation reveals a hard problem.

### Stack

- **TypeScript + Vite + plain DOM.** No React, no Preact, no Lit. The engine's event loop maps cleanly to "re-render everything from `state` after each commit"; UI framework reconciliation buys nothing here and adds bundle weight + a layer of indirection between the event stream and what's on screen.
- **CSS: hand-written, single `styles.css` file.** No Tailwind, no CSS-in-JS. The whole demo is one page; one stylesheet is fine.
- **No router.** Tab state and seed live in the URL hash (`#mode=combat&seed=42`). Makes bug reports shareable.

### Folder layout

```
dnd-srd-engine/
├── src/                       # existing engine, untouched
├── web/                       # new
│   ├── index.html
│   ├── main.ts                # entry, mounts tabs, owns the dispatch loop
│   ├── engine-host.ts         # wraps engine + commit + subscriber notification
│   ├── modes/
│   │   ├── combat-sandbox.ts
│   │   └── event-inspector.ts
│   ├── ui/
│   │   ├── pending-choice.ts  # generic pending-choice resolver (see notes)
│   │   ├── dice.ts            # tiny render helpers
│   │   └── event-row.ts
│   ├── scenarios/
│   │   └── goblin-skirmish.ts # the canned encounter for v1 (new content)
│   └── styles.css
├── vite.config.ts             # existing — leave alone
├── vite.web.config.ts         # new — builds web/ → docs/
└── docs/                      # build output, served by GitHub Pages
```

### Engine import boundary

Import from the **package's public entry point**, the same way an external consumer would. Do not reach into `src/` internals from `web/`. If a helper is missing from the public API, add it to the engine's exports — don't sidestep the boundary. This avoids the dual-build resolution issue where Vite picks ESM but a transitively-imported module picks CJS and Zod schemas get registered twice.

**Decision (settled):** `vite.web.config.ts` aliases `dnd-srd-engine` and `dnd-srd-engine/starter-pack` to the local `src/index.ts` and `src/starter-pack.ts` for dev (so changes to engine source hot-reload into the demo), and falls back to the built `dist/` for production (so the deployed demo uses the same bundle real consumers get). Document this in `web/README.md` when scaffolding.

### Dispatch loop

One function in `engine-host.ts`. The engine's planners take destructured intents (no `payload` wrapper) and the method names are camelCase, so the dispatcher is a small switch over intent kinds, not a generic `engine.plan[intent.type]` lookup:

```ts
type Intent =
  | { kind: 'attack'; attackerId: string; targetId: string; weaponInstanceId: string }
  | { kind: 'move'; combatantId: string; to: { x: number; y: number } }
  | { kind: 'dash'; combatantId: string }
  | { kind: 'dodge'; combatantId: string }
  | { kind: 'disengage'; combatantId: string }
  | { kind: 'endTurn'; encounterId: string }
  | { kind: 'castSpell'; characterId: string; spellId: string; slotLevel: number; targetIds: string[] };

function dispatch(intent: Intent): void {
  let result: { events: ReadonlyArray<Event> };
  switch (intent.kind) {
    case 'attack': result = engine.plan.attack(campaign.state, intent); break;
    case 'move': result = engine.plan.move(campaign.state, intent); break;
    case 'dash': result = engine.plan.dash(campaign.state, intent); break;
    case 'dodge': result = engine.plan.dodge(campaign.state, intent); break;
    case 'disengage': result = engine.plan.disengage(campaign.state, intent); break;
    case 'endTurn': result = engine.plan.advanceTurn(campaign.state, { encounterId: intent.encounterId }); break;
    case 'castSpell': result = engine.plan.castSpell(campaign.state, intent); break;
  }
  campaign = engine.commit(campaign, result.events);
  notifySubscribers();
}
```

Every interaction goes through `dispatch`. No mode commits directly. Subscribers are dumb: they get called, they re-read `campaign.state`, they re-render their slice. Outcomes that return more than `{events}` (shield, polymorph, simulacrum, wish, consumeGuidance, spendHeroPoint) need their own dispatch arms when added — their `events` field flows the same way; the extra fields (`d4`, `preventedHit`, etc.) get passed back to whichever mode invoked them.

### Rendering

- Top-level `render(state)` per mode, called on every commit.
- Each mode owns a single DOM subtree it owns mutation of.
- **Event Inspector must virtualize the event list.** Cap visible rows at ~200; render older events on scroll. The naïve "innerHTML += event" pattern will jank by event 300.
- Derived character sheets cached by the engine's existing memoization (keyed on `state.version`). Don't re-cache in the UI layer.

### PendingChoice handling

Build **one** generic `PendingChoiceResolver` UI component, in `web/ui/pending-choice.ts`, that handles every choice type by dispatching on `choice.kind`. Combat Sandbox mounts it whenever `state.pendingChoices` is non-empty for the active combatant. Do not write per-mode or per-choice-type inline UIs; we will regret it the moment a third choice type appears.

**Caveat:** v1's planner set probably never *emits* a `ChoiceRequired` event — `OfferChoice` mostly fires at level-up (out of scope for v1) and at character-creation feat/skill picks (also out of scope; the demo uses pre-built combatants from `goblin-skirmish.ts`). The resolver may be dead code in v1. Build it anyway — the moment any v2 mode adds character creation or level-up, it'll be needed, and writing it from scratch later means refactoring whichever mode lands first. If it really doesn't fire in v1, document that fact in `web/README.md` rather than removing it.

### RNG and determinism

- Engine is constructed once per page load with `seededRNG(<seed-from-hash>)` (imported from the main barrel).
- "Reset encounter" rebuilds the engine from scratch with the same seed. **Do not** try to reset the RNG stream alone — it diverges from any reference run the moment the user clicks out of order.
- Default seed is `42`. Hash override: `#seed=...`.

### Replay verification (Event Inspector "Import" button)

When the user imports a JSON event log:

1. Build a fresh engine with the same seed and content pack.
2. Replay events one by one via `engine.apply` (not `commit`, since the events already have captured RNG).
3. Compare the resulting `state` against the imported state object using a structural deep-equal.
4. On mismatch, display the first divergent path (e.g. `combatants[2].hp.current: expected 12, got 14`).

This is the demo's headline correctness claim. **Add a CI test that runs this verification against every scenario shipped in `web/scenarios/`**, so the demo can't ship with a broken replay claim.

The engine already exposes `serializeCampaign(c): string` and `loadCampaign(s): Campaign` (the contract test locks this round-trip), so the demo doesn't need a custom JSON shape — it can round-trip through the engine's own serializer.

---

## Build and deploy

### Build target

`vite.web.config.ts`:
- `root: 'web/'`
- `build.outDir: '../docs'`
- `base: process.env.NODE_ENV === 'production' ? '/dnd-srd-engine/' : '/'`
- `resolve.alias` aliases the engine paths to local `src/` in dev (see Engine import boundary above).

`package.json` scripts:
- `dev:web` → `vite --config vite.web.config.ts`
- `build:web` → `vite build --config vite.web.config.ts`

### GitHub Pages

- The workflow self-enables Pages on first run via `actions/configure-pages@v5`'s `enablement: true`, so no manual Settings click is required. To configure by hand instead: Settings → Pages → **Source = "GitHub Actions"** (not "Deploy from a branch").
- Build output goes to `dist-web/` (gitignored) and is uploaded as a Pages artifact by `.github/workflows/deploy-demo.yml`. No build output lives in git.
- This deviates from the original plan's "build into `docs/`, commit back to main" flow. Reason: this repo's `docs/` directory already holds hand-authored markdown guides (`api-overview.md`, `getting-started.md`, etc.). Mixing those with build output would be brittle. The modern artifact-upload flow avoids the collision and keeps the diff history clean.

### Bundle size

- Code-split the starter pack: `await import('dnd-srd-engine/starter-pack')` inside each mode's init, not at module top level. (Subpath confirmed to chunk separately in `0.1.0-alpha.3`.)
- Target: initial JS payload under 250 KB gzipped. If we blow past 400 KB, stop adding features and investigate.

---

## Risks and how we handle them

Each risk gets a specific mitigation. If a risk's mitigation can't be done in v1, the corresponding feature gets cut.

| Risk | Mitigation |
| --- | --- |
| Engine API churns and breaks the demo | Demo imports only from the public package entry. The contract test (`tests/contract/`) catches accidental breakage at engine PR time. When the demo needs a helper that doesn't exist, add it to engine exports (don't sidestep). |
| Demo lags the engine | The dev alias points at local `src/`, so engine work shows up immediately in `dev:web`. Production demo bundles against `dist/`, which is built fresh on every deploy. If the demo behavior diverges from a fresh local `npm run build`, the cause is almost always a stale `package-lock.json` in CI. |
| Replay verification breaks publicly | CI test runs verification against every shipped scenario before deploy. Failing test blocks deploy. |
| `base:` path breaks local dev or production | Use the `NODE_ENV` ternary above. Test both `npm run dev:web` and a local `vite preview` of the production build before pushing. |
| Event log jank at scale | Virtualize from day one. Cap visible event rows. |
| User sees missing class features at L5+ and thinks engine is broken | Banner in Combat Sandbox: "Starter content pack covers L1-5 features only. Higher levels work mechanically but most class features are content-layer TODOs." Gate any level selector at 5. |
| `PendingChoice` UI written three times | Generic `PendingChoiceResolver` from day one. No inline per-mode choice UIs. |
| Demo bundle balloons as starter pack grows | Code-split the pack. Bundle size budget above. |
| Public demo creates pressure that slows engine development | Documented trade-off; mitigation is to keep v1 small and ship via CI so demo updates are free. If demo maintenance starts dominating engine time, archive the demo branch rather than slow the engine. |

---

## Build order

Strict order. Don't start step N+1 until step N works end-to-end.

1. **Scaffold `web/`.** Empty `index.html`, `main.ts` that imports the engine (`createEngine` from `dnd-srd-engine`, `loadStarterPack` from `dnd-srd-engine/starter-pack`) and logs `engine.createCampaign({name:'demo'})` to console. `dev:web` script. Confirms both subpaths import cleanly into a Vite browser build, and that the dev alias resolves `dnd-srd-engine` to local `src/`.
2. **Engine host + dispatch loop.** `engine-host.ts` with `dispatch`, `subscribe`, `getState`. No UI yet; drive it from a `<button>` in `index.html` that fires a hardcoded `dodge` intent and logs the resulting state to console. Dodge is the simplest planner to demo because it has no targets and no dice rolls.
3. **`goblin-skirmish.ts` scenario.** A small TypeScript file that builds the campaign state for the canned encounter: 2-4 combatants (one party fighter + one party wizard + two goblins), known initiative order, fixed starting positions. Use the engine's existing builders (`loadStarterPack`, then `engine.createCampaign` + `commit(CharacterCreated...)` chain). This is new content, not a port from `tests/golden/transcripts/` (the showcase transcript there is one big multi-act campaign, not a single-encounter scenario).
4. **Combat Sandbox skeleton.** Render the scenario as a static list of combatants with HP. No interactivity. Confirms render-on-commit works.
5. **Combat Sandbox interactions.** Wire up Attack, Move, Dash, Dodge, End Turn buttons. Hard-code the action set; don't generalize yet.
6. **Event Inspector.** Side panel showing the event stream. Virtualize the list.
7. **PendingChoice resolver.** Generic component. Whether it fires in v1 or not, build it and document v1's actual reachability in `web/README.md`.
8. **Export / Import event log + replay verification.** This is the headline feature; build last so it has a real event stream to chew on. Use `serializeCampaign` / `loadCampaign` for the JSON round-trip.
9. **CI replay test.** Test that imports each scenario, replays, asserts equivalence. Depends on step 3 (scenarios exist) and step 8 (replay flow exists); add only after both are green.
10. **GitHub Actions deploy workflow.** Only after everything above is green locally.
11. **Banner copy, README updates, screenshot for the repo.**

If any step takes more than ~2x the time it should, stop and update this doc with what was wrong before continuing.

---

## Implementation notes

### What's new in the engine since the original plan

- `engine.plan.dodge` was added in `0.1.0-alpha.3` specifically for this demo. RAW 2024: emits `ActionEconomyConsumed('action')` + `ConditionApplied('dodged')`. The condition imposes disadvantage on incoming attacks and gives advantage on DEX saves. No new wiring needed in the demo beyond binding it to a button.
- The starter-pack subpath (`dnd-srd-engine/starter-pack`) shipped in `0.1.0-alpha.3`. Without it, the demo would have to either pull the full starter content into the main bundle or reach into `src/` internals — both ugly. Now `await import('dnd-srd-engine/starter-pack')` from a mode's init gets a separate ~127 KB / ~16 KB-gzipped chunk.
- `0.1.0-alpha.3` and later versions were originally on npm; the engine is no longer published to a registry. Consumers pin to `github:greghcarr/dnd-srd-engine` (or a local `file:` path) for the same import surface.

### Things this plan got slightly wrong (now fixed in this doc)

- **Dispatch shape**: original pseudocode was `engine.plan[intent.type](state, intent.payload)`. Real API is `engine.plan.attack(state, { ...destructuredIntent })` — camelCase method, no `payload` field. The dispatcher is a small switch over intent kinds (see Dispatch loop above).
- **Scenarios are new content, not ports.** The plan referenced "the canned scenarios from `tests/golden/transcripts/`" — that directory has *one* big multi-act transcript, not a library of single-encounter scenarios. The demo authors its own.
- **PendingChoice reachability in v1 is probably zero.** The plan implies pending choices "arise" during play. With v1's planner set (attack / move / dash / dodge / disengage / endTurn / castSpell), the only paths that would emit a `ChoiceRequired` are level-up flows (not in v1) and content with `OfferChoice` effects on cast (not used by v1's scenario). Build the resolver, document the situation, move on.
- **CI replay test depends on both the scenario files (step 3) and the replay-verification flow (step 8).** The original build order was strict ordering 1→11, but didn't call out that step 9 needs both 3 and 8 in scope. Now explicit.

### Open question for first scaffolding session

How should `goblin-skirmish.ts` be built? Two reasonable shapes:

- **Inline TypeScript builder.** A function that returns a fresh `Campaign` ready to play. Simplest; no JSON. Demo imports it directly.
- **JSON scenario file + loader.** Future-proofs for a "scenario picker" mode and matches how the engine already loads content. More setup, more durable.

Pick during step 3. If unsure, start inline and convert to JSON when the second scenario lands.
