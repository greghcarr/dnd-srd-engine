# Slice 665 — engine + content: non-damage area zone primitive (zone-of-truth, tiny-hut, wind-wall)

**Type:** Engine event + reducer + 3 content edits. **Fifth slice of the post-L3-RAW completeness push. First spell-wiring primitive of the cycle.** Closes 3 deferred L2/L3 spells with one primitive.

The existing slice-495 `zone` mechanic stamps positioned-AOE metadata on the EffectInstance for **concentration** spells (Fog Cloud, Darkness, Silent Image, Stinking Cloud, Silence). This slice extends the same primitive to **non-concentration** zones via a new `SpellEffectStarted` event so the same authoring pattern works for Zone of Truth (L2, 10-min) and Tiny Hut (L3, 8-hour ritual). Wind Wall (L3, concentration) was already structurally supported but had `mechanicalEffects: []` plus no `targeting` field; this slice adds both.

## What's wired

- New `SpellEffectStartedEvent`: mirrors `ConcentrationStartedEvent`'s payload (effectInstanceId, casterId, spellId, targetIds, conditionsApplied, durationMinutes, slotLevel, zone) but is used for non-concentration spell effects.
- New `applySpellEffectStarted` reducer: creates an `EffectInstance` with `requiresConcentration: false`; does NOT set `caster.concentrationEffectId`.
- `planCastSpell` extracts the zone-payload computation out of the concentration block (single source of truth) and adds an `else if (hasZoneMechanic)` branch that emits `SpellEffectStarted` for non-concentration zone-bearing spells.
- Cleanup uses the existing `ConcentrationBroken` event + `clearConcentrationEffect` helper (type-agnostic; works for any EffectInstance). `planExpireSpellDurations` emits the broken event when the listed `durationMinutes` elapses.
- Content edits (3 spells):
  - **zone-of-truth** (L2, non-concentration, 10 min): added `mechanicalEffects: [{ kind: 'zone' }]`. Targeting (sphere/15) already present.
  - **tiny-hut** (L3, non-concentration, 8 hour, ritual): added `mechanicalEffects: [{ kind: 'zone' }]`. Targeting (sphere/10) already present.
  - **wind-wall** (L3, concentration, 1 min): added `targeting: { shape: 'line', size: 50 }` AND `mechanicalEffects: [{ kind: 'zone' }]`. Concentration path was already there; this slice just wires the spell.

## Scope decisions

- **New `SpellEffectStarted` event over generalizing `ConcentrationStarted`**: adding a `requiresConcentration?: boolean` field to ConcentrationStarted would be semantically muddled ("ConcentrationStarted with requiresConcentration: false"). A sibling event is honest about what it does. Both reducers create EffectInstances; only the field values differ.
- **Cleanup re-uses ConcentrationBroken**: the cleanup helper `clearConcentrationEffect` is already type-agnostic — it deletes the EffectInstance + cascades any rider state regardless of `requiresConcentration`. Adding a `SpellEffectEnded` sibling would be overhead for no gain.
- **In-zone effects stay consumer-managed**: the engine ships the positioned-AOE record (shape + size + center). The "creatures in the zone can't deliberately lie" (Zone of Truth), "magical hemisphere admits the named characters only" (Tiny Hut), "nonmagical ranged attacks through the wall have disadvantage + gases dispersed" (Wind Wall) all require the consumer's scene model to enforce. Same boundary as slice 495's existing zone spells (Fog Cloud's heavy obscurement, Darkness's blocked-darkvision arm).
- **Wind Wall as `'line'`**: RAW Wind Wall is a 50-ft wall × 15-ft tall × 1-ft thick. The closest existing shape is `'line'` (size 50). The consumer reads `(shape='line', size=50)` and treats it as a wall in their scene model. A future engine slice could add a `'wall'` shape; out of scope here.
- **Ritual gate for Tiny Hut not enforced engine-side**: the spell ships `ritual: true` in its base record; the consumer chooses whether to invoke ritual cast (no slot cost) or spend a slot. Slice 665 handles the cast outcome regardless.

## Files

- **[../../src/schemas/events/concentration.ts](../../src/schemas/events/concentration.ts)**: added `SpellEffectStartedEventSchema` + `SpellEffectStartedEvent` type.
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: schema imported, added to the discriminated union, added to EVENT_TYPES, re-exported.
- **[../../src/engine/reducers/concentration.ts](../../src/engine/reducers/concentration.ts)**: added `applySpellEffectStarted` reducer.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: reducer imported + dispatched on `'SpellEffectStarted'`.
- **[../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)**: imported `SpellEffectStartedEvent`. Refactored zone-payload computation out of the concentration block. Added `else if (hasZoneMechanic)` branch emitting `SpellEffectStarted` for non-concentration spells.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: added `'SpellEffectStarted'` case to the formatter.
- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: zone-of-truth gains `[{ kind: 'zone' }]` mechanic; tiny-hut gains `[{ kind: 'zone' }]` mechanic; wind-wall gains `targeting: { shape: 'line', size: 50 }` + `[{ kind: 'zone' }]` mechanic.
- **[../../tests/unit/engine/slice-665-non-damage-zone.test.ts](../../tests/unit/engine/slice-665-non-damage-zone.test.ts)** (new): 5 tests
  - zone-of-truth emits SpellEffectStarted with correct zone + post-state EffectInstance has `requiresConcentration: false` and caster slot stays unset.
  - tiny-hut emits SpellEffectStarted with correct zone + 480-minute duration.
  - wind-wall uses existing ConcentrationStarted path with zone payload; caster slot IS claimed.
  - Non-concentration zone does NOT block subsequent concentration casts (no prior-broken event when casting Bless after zone-of-truth).
  - planExpireSpellDurations cleans up the non-concentration zone after its listed duration elapses.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L2 count 36 wired / 6 deferred → 37 wired / 5 deferred. L3 count 27 wired / 5 deferred → 29 wired / 3 deferred. zone-of-truth moved to "Wired, zone-area"; tiny-hut + wind-wall added to L3 "Wired, zone-area".
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate wiring count 198/339 → 201/339; deferred 73 → 70; zone-area count 6 → 9; percentage ~58% → ~59%. Doc-counts audit verifies.

## Tests

- `npx vitest run tests/unit/engine/slice-665-non-damage-zone.test.ts`: 5/5 pass.
- `npx vitest run tests/audit/gaps-spells-counts.test.ts`: 33/33 pass (header counts match content + per-level totals).
- `npx vitest run tests/audit/doc-counts.test.ts`: 19/19 pass (post bump).
- Full suite: 522 files / 3777 passing + 173 skipped (was 521 / 3772 post-664; +1 file / +5 tests from this slice).

## Verification

- `npx tsc --noEmit`: clean.
- `npx vitest run`: green.

## RNG impact / Breaking change

**Additive event** (`SpellEffectStarted`); **additive reducer** (`applySpellEffectStarted`); **additive planCastSpell branch**. No schema changes to existing events, no removed APIs.

**Behavior change**: post-cast state for zone-of-truth + tiny-hut + wind-wall now includes a persisted `EffectInstance` with a `zone` field. Pre-665 cast of these spells emitted ONLY the SpellCastDeclared + SpellSlotConsumed events with no in-state record of the zone. Any consumer that was checking `state.effectInstances` for these spells (and would have found nothing) will now find an entry — this is what the RAW behavior is supposed to be.

## Audit (Uncle Bob)

- **Names**: `SpellEffectStarted` mirrors `ConcentrationStarted`'s naming pattern; `applySpellEffectStarted` mirrors `applyConcentrationStarted`. The lifecycle distinction (concentration claim vs not) is explicit in each reducer's job.
- **DRY**: the zone-payload computation was duplicated between the concentration path and the would-be non-concentration path; refactored to a single block above both branches. The reducer follows the same EffectInstance-construction shape as `applyConcentrationStarted` (could extract a helper if a third instance lands; today two callers don't justify it).
- **SRP**: schema declares the event; reducer creates the EffectInstance; planner emits the event; cleanup is the existing ConcentrationBroken path. Each layer has one job.
- **Magic numbers / strings**: no new ones; tiny-hut's 480-min duration is parsed from "8 hours" via the existing `parseSpellDurationMinutes`; wind-wall's "line/50" matches RAW dimensions.
- **Pattern-check**: scanned every other spell in the pack with `targeting` populated but `mechanicalEffects: []` — only zone-of-truth, tiny-hut, wind-wall (and the L4+ deferred non-damage zones, which slice 665 doesn't cover) fit the pattern today. No silent under-wiring left at the L2/L3 level.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 665 of ~16):

- ~~660-664~~: L3 RAW behavior gaps + L3 cycle deferrals. Landed.
- ~~665 (this slice)~~: non-damage area zone primitive. Landed.
- **666**: On-hit rider via castSpell (shining-smite, ray-of-enfeeblement).
- **667**: Recurring-rider primitive (phantasmal-force).
- **668**: Flight/hover condition (levitate).
- **669**: On-action rider (dragons-breath).
- **670-672**: composite-condition primitives (slow, beacon-of-hope, blink).
- **673-676**: audit + polish.

**Deferred (post-cycle)**:
- **In-zone effect enforcement** (Zone of Truth's "can't deliberately lie", Tiny Hut's hemisphere admit list, Wind Wall's ranged-attack disadvantage / gas dispersal): consumer-managed today. A future engine slice could surface these as RAW arms once the scene-model contract is defined.
- **`'wall'` zone shape**: Wind Wall is modeled as `'line'/50` today; a dedicated `'wall'` shape with width + height + thickness would be more honest. Defer until a second wall spell (Wall of Fire, Wall of Stone) lands.
- **L4+ non-damage zones**: 10 L4 spells, 14 L5 spells in `gaps-spells.md` include several zone candidates. The L4-9 wiring uplift is outside this cycle (which targets L1-L3 RAW completeness).
