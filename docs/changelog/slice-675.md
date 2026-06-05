# Slice 675 — engine: `seedResourcesFromContent` helper

**Type:** Engine utility (pure transform; no schema / event changes). **Fifteenth slice of the post-L3-RAW completeness push.** Closes the slice-660 documented deferral: "Auto-populate `recharge` on `ResourceState` from content grants."

Pre-675, consumers manually hand-authored `character.resources` when building a character (e.g., `[{ resourceId: 'rage', current: 2, max: 2, recharge: 'longRest' }]` for a Barbarian). This is error-prone and drifts when the engine changes the recharge cadence (slice 657's `partialShortFullLong` flip on Channel Divinity is the canonical "consumer had it wrong" case). Slice 675 ships a helper that derives resources from the effective effect stack.

## What's wired

- New helper `seedResourcesFromContent(character, content): Character` exported from `engine/index.ts`.
  - Walks the character's effect stack via `collectEffectsFromCharacter`.
  - For each `GrantResource` effect: looks up the existing resource by `resourceId`; if absent, adds `{ resourceId, current: max, max, recharge, diceSize? }` with `max` evaluated via the formula evaluator (using the character's ability scores, total level, class levels, and proficiency bonus).
  - Per-resourceId: highest `max` across multiple grants wins (matches the existing "dedupe by feature id, highest-level wins" pattern in `dedupeFeaturesByLatestLevel`).
  - Idempotent: pre-existing entries are NOT overwritten. Re-seeding requires resetting `character.resources` to `[]` first.
  - Pure transform: returns a new `Character` (immer-backed); doesn't mutate.

## Scope decisions

- **Separate helper, not auto-call in `createPC`**: `createPC` doesn't have access to a content pack today (it's a pure builder over `CharacterSchema.parse`). Adding `content` as a required arg would be a public-API breaking change. The opt-in helper keeps createPC's signature stable; consumers chain `seedResourcesFromContent` if they want auto-populate.
- **Highest-`max` wins per resourceId**: matches engine convention (dedupeFeaturesByLatestLevel). Barbarian L1 grants rage max=2; L3 `rage-uses-3` grants max=3; the L3 character gets max=3.
- **Pre-existing entries preserved**: if a consumer has already populated a resource with a specific `current` (e.g., the Barbarian already spent a rage), seeding doesn't reset it.
- **Reducer / character-create path NOT touched**: the helper is opt-in at character-build time, not auto-invoked. Existing event-sourced flows behave identically.

## Files

- **[../../src/engine/seed-resources.ts](../../src/engine/seed-resources.ts)** (new): the helper.
- **[../../src/engine/index.ts](../../src/engine/index.ts)**: re-export.
- **[../../tests/unit/engine/slice-675-seed-resources.test.ts](../../tests/unit/engine/slice-675-seed-resources.test.ts)** (new): 5 tests
  - Barbarian L1: rage seeded max=2 recharge='longRest'.
  - Barbarian L3: rage seeded max=3 (highest wins).
  - Cleric L3: channel-divinity seeded recharge='partialShortFullLong' (slice 657 primitive carries through).
  - Idempotent: pre-existing entries unchanged.
  - Fighter L1: second-wind seeded recharge='shortRest'.

## Tests

- `npx vitest run tests/unit/engine/slice-675-seed-resources.test.ts`: 5/5 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Pure addition** — new public-API export, no other surface affected.

## Audit (Uncle Bob)

- **Names**: `seedResourcesFromContent` is unambiguous about both inputs (character + content) and the action (seed = add-if-missing).
- **DRY**: reuses `collectEffectsFromCharacter`, `evaluateFormula`, `proficiencyBonus`, `computeTotalLevel` — no new effect-walker logic.
- **SRP**: the helper has one job. Doesn't touch event flow; doesn't mutate the input.
- **Magic numbers / strings**: none.
- **Pattern-check**: searched for other "consumer must hand-populate state X" patterns: `appliedConditions` (passive auto-applied conditions from species/feats are mostly already handled by feature grants), `featsTaken` (consumer-driven, no auto-populate available), `knownSpells` (consumer-driven). Resource grants were the unique remaining "the engine knows but the consumer has to manually fill in" surface that maps cleanly to a derive-from-content helper.

## Open follow-ups

- ~~660-674~~: L3 RAW behavior + 8 spell-wiring primitives + L2/L3 fully wired + multiclass audit + fuzz widening. Landed.
- ~~675 (this slice)~~: Auto-populate recharge. Landed.
- **676**: Multiclass fuzz support.

**Deferred**:
- Auto-call in `createPC`: would need to extend the signature to take a content pack. Future API-evolution slice.
- Auto-seed at reducer-side `CharacterCreated`: would require giving the reducer access to content (currently it doesn't). Re-architecting reducer-content access is out of scope.
