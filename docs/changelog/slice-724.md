# Slice 724 — engine: Wizard Memorize Spell (L5)

**Type:** Engine feature (new planner + new event). Additive. Wires the slice-54 Wizard L5 stub; completes the L5 stub set. L5 SRD-complete cycle.

SRD 5.2.1 Wizard L5 Memorize Spell: "Whenever you finish a Short Rest, you can study your spellbook and replace one of the level 1+ Wizard spells you have prepared with another level 1+ spell from the book."

## What changed

New `engine.plan.memorizeSpell(state, { wizardId, removeSpellId, addSpellId })` (`planMemorizeSpell`). The engine doesn't enforce prepared-spell **counts** (the prepared list is consumer-managed free state), so this is the mechanical one-for-one swap, validated per RAW:

- the outgoing spell must be currently prepared and level 1+ (not a cantrip);
- the incoming spell must be in the spellbook (`knownSpells`), level 1+, and not already prepared.

Emits a new **`PreparedSpellsChanged`** `{ characterId, removed, added, source }` event; the reducer removes `removed` from and adds `added` to `preparedSpells`. (This is the first event that mutates `preparedSpells` — until now it was set only at character creation.)

The "on a Short Rest" timing is consumer-driven (the consumer invokes the planner after a short rest), matching how other study/preparation steps are driven. Gated on Wizard level 5; the pack `memorize-spell` feature stays a marker.

## Files

- [src/schemas/events/spellcasting.ts](../../src/schemas/events/spellcasting.ts): `PreparedSpellsChangedEvent`.
- [src/engine/reducers/spellcasting.ts](../../src/engine/reducers/spellcasting.ts), [src/engine/apply.ts](../../src/engine/apply.ts), [src/schemas/events/index.ts](../../src/schemas/events/index.ts): reducer + dispatch + barrel.
- [src/engine/plan/memorize-spell.ts](../../src/engine/plan/memorize-spell.ts) (new): `planMemorizeSpell`.
- [src/engine/plan/index.ts](../../src/engine/plan/index.ts), [src/engine/index.ts](../../src/engine/index.ts), [src/engine/conveniences.ts](../../src/engine/conveniences.ts): `engine.plan.memorizeSpell` + `planIntent` dispatch.
- [tests/transcript.ts](../../tests/transcript.ts): format the new event.
- [tests/unit/engine/slice-724-memorize-spell.test.ts](../../tests/unit/engine/slice-724-memorize-spell.test.ts) (new): the swap; rejections (not prepared / not in book / already prepared / cantrip); L4 rejection.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. New event in the `EventSchema` union; `planIntent` dispatch + planner-wiring audit account for `MemorizeSpell`.

## Audit (Uncle Bob)

- **Honest scope**: the engine doesn't enforce prepared-spell counts, so this is the swap mechanic + RAW validation, not a count-gated re-preparation (documented).
- **SRD-faithful validation**: level-1+ only, outgoing must be prepared, incoming must be a non-prepared spellbook spell.
- **Determinism**: pure; no RNG.
- **Pattern-check**: new event mirrors the existing spellcasting events; planner gated on class+level (marker convention).
