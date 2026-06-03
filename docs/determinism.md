# Determinism

The engine has three layers of "deterministic" with different stability guarantees. Understanding which one you depend on tells you what you can rely on across upgrades.

## Layer 1: replay equivalence (always stable)

Given an event log, `replay(events)` produces the same `CampaignState`. Always. Across engine versions, across machines, across time.

This is the foundational architectural invariant. It's asserted in CI for every golden scenario via the `replay-equivalence` test. A reducer that ever reaches for RNG would fail it.

**What you can rely on:**
- An event log generated on engine version A still replays correctly on version B.
- Two clients streaming the same event log arrive at the same state.
- Persisted campaigns load to byte-identical state regardless of when they were saved (within the same `SCHEMA_VERSION`, or after a migration).

## Layer 2: schema versioning (versioned migrations)

`SCHEMA_VERSION` ([src/version.ts](../src/version.ts)) is a monotonic integer that bumps only when the persisted shape of `Event` or `CampaignState` changes incompatibly. Each bump ships with a migration in [src/migrations/](../src/migrations/).

**What you can rely on:**
- Old saves loaded by a newer engine version go through migrations to update their shape. State after the migration is canonical for the new version.
- The migration is part of `loadCampaign`; consumers don't run it explicitly.

**What you cannot rely on:**
- A pre-migration event log replays correctly on a post-migration engine WITHOUT going through `loadCampaign`. If you have raw events stored outside a Campaign envelope, you need to run migrations yourself.

## Layer 3: per-seed RNG reproducibility (version-sensitive)

`engine.plan.X(state, intent)` with a seeded RNG is reproducible — calling it again with the same seed + same state + same intent + same engine version produces the same events byte-for-byte.

**This is the layer most people mean by "deterministic" and it's the most fragile.**

Because the engine's RNG consumption is part of its behavior, any slice that adds or removes a `rollDie()` call changes the RNG stream downstream. The CHANGELOG documents these per-slice. Recent examples from the slice 601-616 cycle:

- **Slice 601**: every `DamageApplied` to a concentrating creature now triggers a CON save (one new `rollDie` per save). Pre-slice, a Bless-concentrating Cleric could be hit by a Fire Bolt with zero RNG consumption beyond the attack roll. Post-slice, the same Fire Bolt also rolls a CON save.
- **Slice 602**: spell attacks against advantage-granting targets now roll 2d20 instead of 1d20. A Faerie Fired wizard attacked by a spell gets a different downstream RNG stream than pre-slice.
- **Slice 611**: spell attacks gained Halfling Luck reroll-on-nat-1. A Halfling caster's nat-1 spell attack now consumes an extra d20.
- **Slice 612**: multi-component damage to a concentrating target now rolls one CON save per source (was one save against the totaled damage). Per-component rolls consume more RNG.
- **Slice 614**: off-hand attacks against advantage-granting targets now roll 2d20.

**What this means for you:**
- A transcript from `combat-fuzz --seed 42` generated against engine v0.1.0-alpha.15 will NOT byte-match `combat-fuzz --seed 42` against a later version, IF any of the changed paths fired in that battle.
- Per-seed reproducibility holds WITHIN an engine version. Across versions, treat it as broken unless you verify against the specific slice diffs since your reference version.

**Practical advice for consumers:**
- For regression testing across engine upgrades: snapshot the resulting `CampaignState` (or the full event log) alongside the seed. The state is what matters; the seed is a generation handle. State comparison is the load-bearing check.
- For tournament-style "share a battle with a friend": share the event log (Export from the demo's Event Log panel → Developer tools → Export), not just the seed.
- For internal testing within one engine version: per-seed reproducibility is reliable. CI uses it extensively (e.g., the fuzz test running `seededRNG(42)`).

## Layer 4: content stability (out of scope for the engine)

The starter content pack ([src/content/packs/starter-pack.json](../src/content/packs/starter-pack.json)) is its own source of stability. A spell whose damage dice change in a content edit will produce different rolls even with the same engine version + same seed. The engine doesn't version its own bundled content; consumers who want content stability should pin their own pack revisions.

## Summary table

| Layer | Stable across | Asserted by |
|---|---|---|
| Replay equivalence | Engine versions, machines, time | `replay-equivalence` test in CI; per-slice for every golden scenario |
| Schema migrations | Versions with bumped `SCHEMA_VERSION` (via migration) | Migration tests |
| Per-seed RNG | One engine version + one content pack revision | Reducer + planner unit tests |
| Content stability | One content pack revision | Drift audit (`tests/audit/srd-drift.test.ts`) |

If you depend on per-seed RNG, pin both the engine version AND the content pack you generated against.
