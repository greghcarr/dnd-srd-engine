# Slice 677 — content: recurring-save spell-ends arms (Shining Smite, Ray of Enfeeblement, Slow)

**Type:** Content edit only. **First slice of the strict-RAW completeness cycle (677-682).** Zero engine code.

The existing `recurringSave` condition primitive + `planTickRecurringSave` planner have supported save-end conditions since Hold Person was wired. Slice 677 adds the metadata to the three spell-conditions that were consumer-driven before:

| Condition | recurringSave shape | Spell |
|---|---|---|
| `shining-smite-target-illuminated` | `{ ability: CON, trigger: turnEnd, onSuccess: removeCondition }` | Shining Smite (slice 666) |
| `enfeebled` | `{ ability: CON, trigger: turnEnd, onSuccess: removeCondition }` | Ray of Enfeeblement (slice 666) |
| `slowed-by-spell-active` | `{ ability: WIS, trigger: turnEnd, onSuccess: removeCondition }` | Slow (slice 670) |

The consumer drives the save tick via `engine.plan.tickRecurringSave({ targetId, conditionId })` at the end of each of the bearer's turns. The DC is resolved from the AppliedCondition's `sourceCharacterId` (set by every spell planner since slice 88).

## Scope decisions

- **Phantasmal Force NOT included**: per RAW, the disbelieve arm is an INT (Investigation) **check** the target takes as an **action** — not a per-turn auto-save. The consumer drives `planAbilityCheck` if/when the target chooses the investigate action. Already wired correctly.
- **Hold Person already wired**: pre-existing `held-paralyzed-active` recurringSave handles it.
- **`fixedDC` not used**: the canonical pattern (Hold Person, Confusion, etc.) is "use the caster's spell DC", which is the default. `fixedDC` is reserved for non-spell uses like Cockatrice's Petrifying Bite.

## Files

- **[../../src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json)**: 3 conditions gain `recurringSave` metadata.
- **[../../tests/unit/engine/slice-677-recurring-save-spell-ends.test.ts](../../tests/unit/engine/slice-677-recurring-save-spell-ends.test.ts)** (new): 6 tests
  - 3 schema-pin tests (each condition declares the expected `recurringSave` shape).
  - 3 behavioral tests (save-success removes the condition; iterates seeds to find a passing save outcome deterministically).

## Tests

- `npx vitest run tests/unit/engine/slice-677-recurring-save-spell-ends.test.ts`: 6/6 pass.
- `npx vitest run tests/audit/pack-integrity.test.ts`: 24/24 pass.

## Verification

- `npx tsc --noEmit`: clean.

## RNG impact / Breaking change

**Content-only addition**. No event-shape change. Consumers who were manually committing `ConditionRemoved` after their own save logic can switch to `planTickRecurringSave` for the engine-driven path.

## Audit (Uncle Bob)

- **Names**: each `recurringSave` block follows the existing Hold Person / Confusion shape exactly.
- **DRY**: zero engine code — the primitive already exists and was always going to be the path for these.
- **SRP**: pure content edits.
- **Magic numbers**: none.
- **Pattern-check**: searched for other wired spell-applied conditions that lack `recurringSave` despite RAW requiring an end-of-turn save: none remain at L1-L3 (`charmed`, `frightened`, `restrained` are RAW-base and consumer-managed; the variants that need save-ends are now covered).

## Open follow-ups

Strict-RAW completeness cycle (slice 677 of 6):

- ~~677 (this slice)~~: recurring-save spell-ends arms. Landed.
- **678**: HalvesDamageOfKind primitive (enfeebled half-STR-weapon enforcement).
- **679**: Death-save advantage threading (Beacon of Hope arm).
- **680**: Slow's no-reactions + action-OR-bonus restrictions.
- **681**: Slow's max-one-attack cap.
- **682**: Slow's spellcasting 50% V/S/M failure gate.
