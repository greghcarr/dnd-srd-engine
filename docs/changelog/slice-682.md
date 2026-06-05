# Slice 682 — engine: Slow's spellcasting V/S d20 fizzle gate

**Type:** Engine schema + planCastSpell + apply dispatch. **Sixth and final slice of the strict-RAW completeness cycle (677-682).**

RAW Slow (PHB 2024): "Whenever the target attempts to cast a spell with a Somatic or Verbal Component, it must roll a d20. On an 11 or lower, the spell doesn't take effect, and the spell's action is wasted (but its components and Spell Slot, if used, aren't expended)."

Pre-682 a slowed caster could cast V/S spells normally. Slice 682 enforces the d20 gate at planCastSpell time.

## What's wired

- New `SpellCastFizzledEvent { characterId, spellId, reason: 'slow-spell-v-or-s-d20-failed', d20 }`. No-op reducer (transcript-only marker).
- `planCastSpell` rolls a d20 before the SpellCastDeclared emission when the caster has `slowed-by-spell-active` AND the spell has V or S components. On d20 ≤ 10:
  - Emit `SpellCastDeclared` (the attempt happened).
  - Emit `SpellCastFizzled`.
  - Emit `ActionEconomyConsumed` for the cast's action (RAW: "the action is wasted").
  - Return early — no slot consumption, no mechanical effects, no concentration claim.
- Transcript formatter renders the fizzle as `"<caster>'s <spell> fizzled — Slow's d20 ≤ 10 (rolled N); action wasted, slot preserved."`

## Scope decisions

- **New event over field-on-SpellCastDeclared**: separating the "attempt happened" event from the "attempt fizzled" event keeps SpellCastDeclared's semantics clean. The fizzle reason field is currently single-valued (`'slow-spell-v-or-s-d20-failed'`); future fizzle conditions (e.g., a hypothetical magic-fail effect) extend the enum.
- **Roll d20 inside planCastSpell, not via planSave**: this is a pre-cast gate, not a save the consumer triggers. Inline roll keeps the planner self-contained.
- **Hardcoded condition id**: matches slice 680/681 — Slow is the only RAW user. Generalize to a marker primitive (`BlocksVerbalSomaticSpells`) if a second user arrives.
- **Slot, components, concentration all preserved on fizzle**: matches RAW exactly. The action consumption IS recorded.

## Files

- **[../../src/schemas/events/spellcasting.ts](../../src/schemas/events/spellcasting.ts)**: new `SpellCastFizzledEventSchema` + type.
- **[../../src/schemas/events/index.ts](../../src/schemas/events/index.ts)**: imported, added to discriminated union, added to EVENT_TYPES, re-exported.
- **[../../src/engine/apply.ts](../../src/engine/apply.ts)**: no-op case for 'SpellCastFizzled' (transcript-only).
- **[../../src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts)**: pre-declare d20 gate; on failure emit SpellCastDeclared + SpellCastFizzled + ActionEconomyConsumed + return early.
- **[../../tests/transcript.ts](../../tests/transcript.ts)**: new formatter case for SpellCastFizzled.
- **[../../tests/unit/engine/slice-682-slow-cast-fizzle.test.ts](../../tests/unit/engine/slice-682-slow-cast-fizzle.test.ts)** (new): 3 tests
  - Slowed + V/S + d20 ≤ 10 → SpellCastFizzled, no SpellSlotConsumed, no DamageRolled.
  - Slowed + V/S + d20 ≥ 11 → normal cast (slot consumed).
  - Non-slowed → no SpellCastFizzled ever fires.

## Tests

- `npx vitest run tests/unit/engine/slice-682-slow-cast-fizzle.test.ts`: 3/3 pass.
- Full suite: 538 files / 4102 passing (+ 1 snapshot regen for `enfeebled` — slice 678's HalvesStrengthWeaponDamage made it appear in the wired-conditions catalog).

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Additive event** (`SpellCastFizzled`); **behavior change** for slowed casters of V/S spells. Pre-682 they cast normally; post-682 they pull a d20 (slot preserved on fail). Consumers replaying transcripts that include a slowed caster casting V/S spells will see different RNG-stream outcomes downstream.

## Audit (Uncle Bob)

- **Names**: `SpellCastFizzled` is honest about what happened; the `reason` enum disambiguates which gate fizzled.
- **DRY**: roll + emit-and-return follows the same pattern as the existing reaction-already-used gates in cast-spell. ActionEconomyConsumed emission code duplicated rather than extracted (single fizzle path; refactor when a second one arrives).
- **SRP**: schema declares; reducer no-ops; planner gates; transcript formats. Each layer's job is single-step.
- **Magic numbers**: `10` (the d20 threshold) is inline; RAW-fixed. `D20_SIDES` named constant for the roll.
- **Pattern-check**: scanned for other "pre-cast d20 gate" cases — none today (Counterspell intercepts post-declare, Wish backlash is post-cast). Slow is the unique pre-cast gate.

## Open follow-ups

**Strict-RAW completeness cycle is closed (slices 677-682, all six landed).**

- ~~677~~: recurring-save spell-ends arms (Shining Smite / Ray of Enfeeblement / Slow).
- ~~678~~: HalvesStrengthWeaponDamage primitive (enfeebled enforcement).
- ~~679~~: GrantDeathSaveAdvantage marker (Beacon of Hope arm).
- ~~680~~: Slow's no-reactions + action-OR-bonus restrictions.
- ~~681~~: Slow's max-one-attack cap.
- ~~682 (this slice)~~: Slow's V/S spellcast fizzle gate.

**Engine is now strict-RAW-complete for L1, L2, and L3.** Every documented "engine *could* enforce this but doesn't" arm from the prior L3 RAW audit is closed.

The remaining engine-scope-excluded arms (positions, plane model, scene geometry, DM judgment) stay consumer-managed by intent — they're documented as not the engine's job in [docs/engine-scope.md](../engine-scope.md).
