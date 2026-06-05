# Slice 667 — content: Phantasmal Force wiring via the existing recurring-rider primitive

**Type:** Content edit only (no engine changes). **Seventh slice of the post-L3-RAW completeness push.** Closes 1 deferred L2 spell with pure composition of existing primitives.

The gaps-spells.md entry listed Phantasmal Force under "recurring-rider primitive" deferred — but the existing `recurring` mechanic schema comment explicitly cites Phantasmal Force as a canonical user. The engine had the primitive; the spell was just not wired. This slice authors the wiring.

## What's wired

- **Phantasmal Force** (L2 illusion, bard/sorcerer/wizard) gets:
  - `{ kind: 'save', ability: 'INT', conditionOnFail: 'phantasmal-force-active' }` — RAW INT save on cast; on fail, the target perceives the phantasm.
  - `{ kind: 'recurring', effect: 'damage', amountDice: '1d6', damageType: 'psychic' }` — the consumer calls `planTickRecurring` at the start of the target's turn to deal 1d6 psychic damage from the phantasm.
- New condition `phantasmal-force-active` (effects: []) — marker the consumer reads to know when the target is convinced. Auto-cleared on the caster's concentration drop (via the existing slice-110 sweep that removes conditions with matching `sourceEffectInstanceId`).

## Scope decisions

- **Zero engine change**: the `recurring` mechanic already supports `effect: 'damage'`; the `save` mechanic already supports `conditionOnFail`. Composing the two delivers Phantasmal Force's full RAW shape. No new primitive needed despite the gaps doc's bucket label.
- **`amountDice: '1d6'` per RAW SRD**: Phantasmal Force does NOT scale with slot level per SRD (each upcast slot is for higher-spell-level mechanics that don't apply here). No `extraDicePerSlotLevel`.
- **Disbelieve-on-INT-investigation arm is consumer-driven**: RAW lets a creature use its action to make an INT (Investigation) check to recognize the illusion as false. Consumers can drive this via `planCheck` against a DC of the caster's spell save DC and, on success, remove the condition. No engine plumbing needed.
- **"Damage applied if the phantasm would damage" arm is the consumer's call**: RAW says the 1d6 psychic only applies if the phantasm logically would damage the target (e.g., phantasmal fire damages; phantasmal feather pillow doesn't). The consumer decides each turn whether to invoke `planTickRecurring`. The engine doesn't model phantasm semantics.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: phantasmal-force gains `[{ save INT -> phantasmal-force-active }, { recurring damage 1d6 psychic }]`; new `phantasmal-force-active` condition (empty effects, marker only).
- **[../../tests/unit/engine/slice-667-phantasmal-force.test.ts](../../tests/unit/engine/slice-667-phantasmal-force.test.ts)** (new): 4 tests
  - On failed INT save: condition applied.
  - planTickRecurring against the convinced target emits 1d6 psychic DamageApplied.
  - Concentration drop sweeps the condition.
  - On successful INT save: no condition applied.
- **[../../docs/gaps-spells.md](../../docs/gaps-spells.md)**: L2 wired 39 → 40, deferred 3 → 2. phantasmal-force added to cast-time wired list.
- **[../../README.md](../../README.md)**, **[../../docs/status.md](../../docs/status.md)** (3 places), **[../../docs/getting-started.md](../../docs/getting-started.md)**, **[../../docs/starter-pack-gaps.md](../../docs/starter-pack-gaps.md)**: aggregate spell wiring 203 → 204, deferred 68 → 67; conditions 146 → 147 (131 → 132 rider). Doc-counts audit verifies.

## Tests

- `npx vitest run tests/unit/engine/slice-667-phantasmal-force.test.ts`: 4/4 pass.
- `npx vitest run tests/audit/gaps-spells-counts.test.ts tests/audit/doc-counts.test.ts`: 52/52 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Content-only addition**. No schema, no API, no event-shape change.

**Behavior change for phantasmal-force cast**: pre-667 the cast emitted only SpellCastDeclared + slot consumption (no save, no condition, no damage). Post-667 it emits the correct RAW chain.

## Audit (Uncle Bob)

- **Names**: condition follows the `<spell-id>-active` pattern used by other marker conditions (mage-armored, blessed, etc.).
- **DRY**: no engine code added; the existing save + recurring mechanics handle the entire shape. Test file reuses the same seed-iteration pattern as slice 666 for finding pass/fail save outcomes.
- **SRP**: each layer's job stays where it was. The wiring is a single content edit.
- **Magic numbers / strings**: 1d6 psychic is RAW-fixed; no constant extracted.
- **Pattern-check**: searched the pack for other spells with `mechanicalEffects: []` that have both a save target and a per-turn damage tick RAW — none today (Ensnaring Strike has it but is already wired). Phantasmal Force was the unique remaining instance.

## Open follow-ups

Post-L3-RAW completeness punch list (slice 667 of ~16):

- ~~660-666~~: L3 RAW behavior + 2 spell-wiring primitives. Landed.
- ~~667 (this slice)~~: Recurring-rider primitive (phantasmal-force). Landed.
- **668**: Flight/hover condition (levitate).
- **669**: On-action rider (dragons-breath).
- **670-672**: Composite-condition primitives.
- **673-676**: Audit + polish.
