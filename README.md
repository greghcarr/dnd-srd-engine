# dnd-srd-engine

[![CI](https://github.com/greghcarr/dnd-srd-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/greghcarr/dnd-srd-engine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](tsconfig.json)
[![Status](https://img.shields.io/badge/status-alpha-yellow)](README.md#status)

A standalone, event-sourced TypeScript domain engine for Dungeons & Dragons 5.5e (the 2024 rules update). Schema-only. Bring your own content pack (a starter SRD-shaped pack ships in the box).

The package is named `dnd-srd-engine` because the long-term plan extracts the system-agnostic core (event sourcing, plan/commit, branded IDs, content packs, sessions, party, predicate / formula DSL) into a future `ttrpg-engine-core` package, with `dnd-srd-engine` becoming the 5.5e adapter. See [VERSIONING.md](VERSIONING.md) and the Phase F slice in [docs/roadmap.md](docs/roadmap.md).

If you are building a D&D character sheet, encounter tracker, virtual tabletop, automation tool, or AI dungeon master and you do not want to reimplement the rules engine from scratch, this is for you.

## Try it in your browser

A live demo of the engine — combat sandbox + event inspector + import/export with replay verification — runs on GitHub Pages: **https://greghcarr.github.io/dnd-srd-engine/** (deployed via `.github/workflows/deploy-demo.yml`; one-time setup is Settings → Pages → Source = "GitHub Actions"). Source lives under [web/](web/). See [web/README.md](web/README.md) for local development.

## Quick start

The engine is not currently published to a package registry. Clone the repo and work against source:

```sh
git clone --recurse-submodules https://github.com/greghcarr/dnd-srd-engine.git
cd dnd-srd-engine
npm install
npm test
```

The `--recurse-submodules` flag pulls in the SRD 5.2.1 markdown at `references/srd-markdown/` (CC-BY-4.0, sourced from [`greghcarr/dnd-5e-srd-markdown`](https://github.com/greghcarr/dnd-5e-srd-markdown)). If you forgot the flag, run `git submodule update --init --recursive` afterward. The markdown is the canonical source of truth for SRD rules text; contributors authoring or auditing content slices need it.

**See it run a real combat in 5 seconds:**

```sh
npx tsx examples/02-combat-encounter/index.ts
```

Output:

```
After Alyx's swing:
  Goblin A HP: 8/15
Replay equivalent: true
apply() is RNG-free: OK
```

That single command builds two L3 fighters, runs an encounter, resolves one weapon attack, and proves the event log replays byte-for-byte. The other examples (`examples/00-quickstart/`, `examples/01-character-sheet/`, `examples/03-save-and-load/`) cover sheet derivation and save/load. Each is a single 20-80 line file — read them inline if you prefer reading to running.

**Want to watch random battles?** The combat-fuzz CLI generates seeded markdown transcripts of L1-L5 PCs (and optionally monsters) fighting each other. Useful for seeing the engine exercise itself across hundreds of class/species/spell interactions:

```sh
npx tsx scripts/combat-fuzz.ts --count 10 --seed 1 --level 3 --mode 2v2 --out /tmp/fuzz
# wrote 10 transcripts + index.md to /tmp/fuzz
```

Flags: `--level 1..5`, `--mode 1v1|2v2`, `--vs pc|monster`, `--rest none|short|long`. See [scripts/combat-fuzz.ts](scripts/combat-fuzz.ts).

Then import from `src/` (or a local path alias) the same shapes the planned public API surfaced:

<!-- typecheck -->
```ts
import {
  createEngine, loadStarterPack, createPC, commit,
  seededRNG, newEventId,
} from './src/index.js';

const engine = createEngine({ contentPacks: [loadStarterPack()], rng: seededRNG(42) });
const alyx = createPC({
  name: 'Alyx', speciesId: 'human', backgroundId: 'soldier',
  classId: 'fighter', level: 3, hpMax: 26,
  abilityScores: { STR: 16, DEX: 14, CON: 14, INT: 10, WIS: 12, CHA: 8 },
});

let campaign = engine.createCampaign({ name: 'demo' });
campaign = commit(campaign, [
  { id: newEventId(), at: new Date().toISOString(), type: 'CharacterCreated', snapshot: alyx },
]);

const sheet = engine.derive.character(campaign.state, alyx.id);
console.log(`${alyx.name}: AC ${sheet.ac.total}, HP ${sheet.hp.current}/${sheet.hp.max}`);
```

That snippet shows the shortest "engine is alive" path: load the starter pack, build a character, derive their sheet. The next step depends on what you want to do:

- **I want to walk through my first attack + save/load (15 min, copy-paste runnable):** [docs/getting-started.md](docs/getting-started.md).
- **I want runnable code I can read or run right now:** [examples/](examples/) (four small scripts, each one file).
- **I want to understand events / plan-commit / why the API has this shape:** [docs/concepts.md](docs/concepts.md).
- **I'm looking up a specific symbol:** [docs/api-overview.md](docs/api-overview.md).
- **I'm extending the engine (houserules, new content, custom planners):** [docs/recipes.md](docs/recipes.md) for patterns, then [CLAUDE.md](CLAUDE.md) for the working manual.

## What lives in this repo

| Path | What it is |
|---|---|
| [src/](src/) | The engine: schemas, reducers, planners, derivations, starter content pack. Public surface in [src/index.ts](src/index.ts). |
| [tests/](tests/) | Engine test suite (unit, golden scenarios + transcripts, property, audit, boundaries). |
| [docs/](docs/) | Working docs: [status](docs/status.md), [roadmap](docs/roadmap.md), [slice template](docs/slice-template.md), [per-category gap catalogs](docs/starter-pack-gaps.md). |
| [examples/](examples/) | Small runnable scripts showing API usage. |
| [references/srd-markdown/](references/srd-markdown/) | The SRD 5.2.1 markdown clone (git submodule). Canonical source for rules text; never substitute web lookups. |
| [web/](web/) | Browser demo for the engine (combat sandbox + event inspector). Deployed to GitHub Pages. |
| [dndbnb/](dndbnb/) | A D&D Beyond-style consumer app built on the engine. Co-located so engine changes flow into it without a publish cycle. Has its own [README](dndbnb/README.md) and deploy workflow. |
| [supabase/](supabase/) | dndbnb's database migrations (Postgres + Auth + RLS). Not used by the engine itself. |
| [CLAUDE.md](CLAUDE.md) / [AGENTS.md](AGENTS.md) / [.cursorrules](.cursorrules) | Working manual (CLAUDE.md) plus cross-agent pointers for tools that don't auto-load it. Anyone doing non-trivial work reads CLAUDE.md end-to-end first. |

## Documentation

Pick the doc that matches what you want:

| You want to... | Read this |
|---|---|
| Try the smallest possible working example | [examples/00-quickstart](examples/00-quickstart/) |
| Walk through your first character, attack, and save/load | [docs/getting-started.md](docs/getting-started.md) |
| Understand the mental model (events, plan/commit, content packs) | [docs/concepts.md](docs/concepts.md) |
| Look up a specific public symbol | [docs/api-overview.md](docs/api-overview.md) |
| See common patterns (save, undo, houserules, multiplayer sync) | [docs/recipes.md](docs/recipes.md) |
| Author content packs (spells, classes, feats, items, monsters) | [docs/authoring-content-packs.md](docs/authoring-content-packs.md) |
| Try the web demo in your browser | [https://greghcarr.github.io/dnd-srd-engine/](https://greghcarr.github.io/dnd-srd-engine/) |
| Hack on the web demo locally | [web/README.md](web/README.md) |
| Read the demo's architecture decisions | [docs/web-demo-plan.md](docs/web-demo-plan.md) |
| Understand what's missing before the engine is trustworthy for unsupervised play | [docs/trustworthiness-roadmap.md](docs/trustworthiness-roadmap.md) |
| Watch a full multi-act campaign run | [the showcase transcript](tests/golden/transcripts/showcase.transcript.md) |
| Know what each version means (alpha / beta / rc / 1.0) | [VERSIONING.md](VERSIONING.md) |
| Read the change history | [CHANGELOG.md](CHANGELOG.md) |
| Understand the IP / attribution situation | [NOTICE](NOTICE) and [docs/content-attribution.md](docs/content-attribution.md) |

## Why this engine

- **Built for accuracy first.** Full mechanical coverage of the 2024 Player's Handbook, Dungeon Master's Guide, and Monster Manual is the explicit goal. Every printed class, subclass, species, background, feat, spell, weapon, armor, magic item, condition, and monster statblock can be expressed.
- **No content, no IP problems.** The library ships schemas and an engine. It does not ship any rulebook text or statblocks. You bring your own content packs (built from the SRD 5.2 or your own homebrew), and the engine validates and runs them.
- **Event-sourced, fully deterministic replay.** Every state change is an event. A captured event log replays to byte-identical state across machines. Undo and redo are free.
- **Plan/commit split.** All randomness is consumed inside `engine.plan(intent)` and baked into resolution events. `apply()` is pure and replay never re-rolls dice. This is the architectural foundation that makes multiplayer sync, save files, and audit logs work correctly.
- **Effect-primitive vocabulary plus escape hatch.** 52 declarative primitives express the bulk of 5.5e features as pure data; a `CustomEffect` code-handler hook covers genuinely-procedural exotica (Wild Shape, Wish, Simulacrum) and table-specific houserules. The exact count drifts; the authoritative list is `EFFECT_KINDS` in [src/schemas/effects.ts](src/schemas/effects.ts).
- **Solid foundations.** TypeScript strict mode. Zod validation at boundaries. Immer-backed reducers, immutable externally. ESM and CJS builds. Zero peer-dependency conflicts.
- **Consumer read layer.** Beyond running the rules, a pure read/view-model surface renders the three screens a player-facing app needs: content browse (`querySpells` / `queryMonsters` / `queryItems`), a full character sheet (`buildCharacterSheet`: AC, saves, skills, attacks, spellcasting, speeds, inventory), and a combat tracker (`buildEncounterView`). See [docs/api-overview.md](docs/api-overview.md).
- **Living transcripts.** Every golden test emits a human-readable markdown transcript of its event log (one action per paragraph; open in VS Code and run "Open Preview" to read it as rich text), checked into [tests/golden/transcripts/](tests/golden/transcripts/). Every PR that changes engine behavior shows the transcript diff alongside the code. See [the showcase transcript](tests/golden/transcripts/showcase.transcript.md) for "The Stoneheart Saga": a multi-act campaign that exercises sessions and journals, party currency and bastion management, locations + doors + terrain, NPC reaction rolls, mounts and a supply wagon, travel and forage, two combat encounters (goblin scouts then a young red dragon) covering attack chains with advantage and counterspell and weapon mastery and concentration breakage, action surge, off-hand strikes, sneak attack, opportunity attacks, falling, polymorph (Alyx into a giant ape), multiattack creatures, fire-mitigation, death save plus revivify, quest objectives plus milestone plus XP plus reward claim, magic-item charges plus dawn recharge, downtime training plus crafting, and replay-equivalence plus RNG-capture invariants over the whole multi-act transcript.

## Architecture

- **Event-sourced.** State changes are events. `apply(state, event) -> state` is pure. Replay any campaign from its event log.
- **Plan/commit split.** RNG is consumed only inside `engine.plan(intent)`. Resolution events carry baked rolls, so `apply()` is deterministic. Replay never re-rolls.
- **Effect-primitive vocabulary.** Features (class features, feats, magic item powers, conditions) are described via a fixed vocabulary of effect primitives (the authoritative list is `EFFECT_KINDS` in [src/schemas/effects.ts](src/schemas/effects.ts); currently 52 primitives plus the `Custom` escape hatch). Wild Shape, Polymorph, Wish, Simulacrum and a handful of others drop to code handlers.
- **Schema-only.** The library ships shapes (`Character`, `Spell`, `MagicItem`, `MonsterStatblock`, etc.) and the engine that operates on them. Consumers load rules content from their own JSON content packs. This keeps the IP story clean.
- **Branded IDs + ULIDs.** `CharacterId`, `SpellId`, `ItemDefinitionId` versus `ItemInstanceId`, etc. Backed by ULIDs (lexicographically sortable by time).
- **PendingChoice protocol.** Deferred player decisions (ASI vs feat, fighting style selection, spell target selection) are first-class events in the log.
- **Zod for validation, Immer for clean reducers, Vitest for tests.**

## Status

**Alpha.** Architecturally complete and content-substantial. A comprehensive test suite (unit, golden + transcripts, property, audit, boundaries) backs the load-bearing invariants (event-sourcing, plan/commit, RNG capture, replay equivalence, branded IDs, effect primitives), which are locked and proven; the engine compiles and builds (ESM + CJS + `.d.ts`). The 48-probe RAW-compliance audit at [tests/audit/raw-compliance.test.ts](tests/audit/raw-compliance.test.ts), plus the SRD ground-truth conformance audits that compare derived values (AC, saves, spell DC, weapon damage, speeds) to the SRD text, pass in full; the [SRD coverage ledger](docs/srd-coverage-ledger.md) tracks per-rule verification (which rules are checked against the book vs author-asserted). **SRD 5.2.1 pack-presence is complete across every category** (spells, monsters, magic items, species, feats, backgrounds, conditions); what's still growing is mechanical wiring depth, not catalog coverage.

At a glance:

- **Engine architecture**: 100%. Locked.
- **Effect-primitive vocabulary**: ~75% of the planned `EFFECT_KINDS` shipped (52 primitives + `Custom` escape hatch); the rest of the backlog enumerated in [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md).
- **Classes / species / backgrounds / feats / conditions / spells / monsters / magic items**: SRD 5.2.1 catalog complete in every category. Spell mechanical wiring ~54% (182/339 wired, 70 narrative, 87 schema-only; the 12 non-SRD wired spells moved to the phb-2024-extras pack in slice 402); magic-item mechanical wiring ~35% (~91/258, after single-base magic weapons/armor were re-modeled into the weapon/armor categories in slices 315-317); consumables ~65% (~45/69).
- **Variant rules**: `grittyRest` + `heroPoints` enforce; `sanity` + `massCombat` toggle but don't enforce.

For the full coverage table, per-category breakdown, known gaps (engine, content, test infrastructure), and severity ranking, see **[docs/status.md](docs/status.md)**.

## Roadmap

Six phases (A-F). Phases A-E completed at alpha.5 (slices 1-46). Post-alpha.5 work runs on a "primitive + canonical user" cadence: each slice adds a focused engine primitive plus the first RAW spells / features / items that exercise it. Phase F (`ttrpg-engine-core` extraction) is explicitly optional and only worth doing if multi-system support becomes a real goal.

The full per-phase slice catalog (Phase A: 16 engine-mechanics slices, Phase B: 4 state-schema slices, Phase C: 10 combat-fill-in slices, Phase D: 7 adoption-surface slices, Phase E: 9 content-fill-out slices, Phase F: 1 optional core-extraction slice) lives in **[docs/roadmap.md](docs/roadmap.md)**, alongside the post-alpha.5 vocabulary-expansion grouping by theme (spell catalog completion, class features fill-out, ~35 engine primitives).

What "perfect" cannot mean: 5.5e explicitly delegates some rulings to the DM (improvised actions, narrative consequences, table houserules, ambiguous spell interactions that even Sage Advice has issued multiple clarifications on). The `CustomEffect` code-handler escape hatch is the explicit spot for table-specific rulings. After all phases the engine covers ~95% of printed mechanics by surface area; the rest is documented as DM-discretion territory.

## Install

The engine is no longer distributed through a package registry. Pin to a git ref or a local path while iterating:

```jsonc
// in your consumer's package.json
"dependencies": {
  "dnd-srd-engine": "github:greghcarr/dnd-srd-engine"
  // or, when developing alongside the engine:
  // "dnd-srd-engine": "file:../dnd-srd-engine"
}
```

The package's build outputs are still produced (ESM, CJS, and `.d.ts` under `dist/`); peer dependencies (`zod`, `immer`, `ulid`) install transitively through the git/file dependency. See [VERSIONING.md](VERSIONING.md) for the alpha-to-1.0 roadmap and the alpha->beta promotion gate.

## Usage (preview)

```ts
import {
  createEngine,
  loadContentPack,
  seededRNG,
} from 'dnd-srd-engine';
import myContent from './my-content-pack.json';

const engine = createEngine({
  contentPacks: [loadContentPack(myContent)],
  rng: seededRNG(42),
});

let campaign = engine.createCampaign({ name: 'home game' });
// commit CharacterCreated + ItemAcquired events, then:

// melee attack
campaign = engine.commit(campaign, engine.plan.attack(campaign.state, {
  attackerId: alyx.id,
  targetId: goblin.id,
  weaponInstanceId: longsword.id,
}).events);

// cast a spell
campaign = engine.commit(campaign, engine.plan.castSpell(campaign.state, {
  characterId: wizard.id,
  spellId: 'fireball',
  slotLevel: 3,
  targetIds: [goblin1.id, goblin2.id, goblin3.id],
}).events);

// level up with a rolled HP gain
campaign = engine.commit(campaign, engine.plan.levelUp(campaign.state, {
  characterId: alyx.id,
  classId: 'fighter',
  hpStrategy: 'roll',
}).events);

// derive a character sheet (effective AC, saves, spell slots, etc.)
const sheet = engine.derive.character(campaign.state, alyx.id);
// sheet.ac, sheet.savingThrows, sheet.spellSlots, etc.
```

For a step-by-step walkthrough, see [docs/getting-started.md](docs/getting-started.md). For the full surface, see [docs/api-overview.md](docs/api-overview.md). See [DEVELOPMENT.md](DEVELOPMENT.md) for the dev workflow and [CLAUDE.md](CLAUDE.md) for architecture conventions.

## Intellectual property

The package ships two categories of material under two licenses. See [NOTICE](NOTICE) for the full attribution and [docs/content-attribution.md](docs/content-attribution.md) for an item-by-item audit of the starter content pack.

**Engine code (MIT)**: all TypeScript source under `src/` (excluding `src/content/packs/`) is original work expressing public-domain game mechanics. The reducers, planners, schemas, derivations, and effect primitives are this package's own implementation; they incorporate no copyrightable expression from Wizards of the Coast publications.

**Starter content pack (CC BY 4.0)**: `src/content/packs/starter-pack.json` contains material derived from the Dungeons & Dragons System Reference Document 5.2, copyright Wizards of the Coast LLC, used under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/legalcode). The mechanical encodings (JSON structure, effect-primitive vocabulary, level-table shapes) are this package's own work; the derived material consists of names, structural rules, and numeric values present in SRD 5.2. Most-but-not-all of the pack is confidently SRD-covered; see the audit doc for items (notably Bastions and Epic Boons) where SRD inclusion was not independently verified by the authors.

**Trademarks**: "Dungeons & Dragons", "D&D", and related marks are trademarks of Wizards of the Coast LLC. This project is not affiliated with or endorsed by Wizards of the Coast. The package name `dnd-srd-engine` uses generic descriptive terms.

If you build your own content pack to load into this engine, your pack's license is your choice and is independent of this package.

## Contributing

The engine is structured so that anyone (or any AI coding agent) can clone the repo and start contributing effectively. The working manual is [CLAUDE.md](CLAUDE.md): quality bar, branch structure, commit conventions, SRD-as-canon, slice cadence, pre-commit Uncle Bob audit, architecture. Read it before opening anything else.

Then:

- [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor flow and testing standard.
- [DEVELOPMENT.md](DEVELOPMENT.md) for dev commands and branch flow (slice work goes to `dev`, never `main`).
- [docs/starter-pack-gaps.md](docs/starter-pack-gaps.md) for the prioritized backlog of next slices.
- [docs/slice-template.md](docs/slice-template.md) for the per-shape checklist (new planner / new content / new derivation).

The architecture is locked. The quality bar is high: **incorrect code is worse than no code.** Contributions that fit within the locked architecture are welcome; open an issue before a large architectural change.

## License

Engine code: [MIT](LICENSE). Copyright (c) 2026 Greg Carr.

Starter content pack: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) (derived from D&D SRD 5.2). See [NOTICE](NOTICE) for the required attribution.
