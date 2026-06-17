# Slice 887 — Suffocation (the breath / Exhaustion mechanic)

**Type:** Engine (new event + reducer + two consumer-driven planners + a Character counter). Closes the L7 audit Area-8 quirk `no-suffocation`.

## RAW

rules-glossary "Suffocation" (2024): *"A creature can hold its breath for a number of minutes equal to 1 plus its Constitution modifier (minimum of 30 seconds) before suffocation begins. When a creature runs out of breath or is choking, it gains 1 Exhaustion level at the end of each of its turns. When a creature can breathe again, it removes all levels of Exhaustion it gained from suffocating."*

(Note: this is the **2024** rule — Exhaustion accrual, not the 2014 drop-to-0. SRD-canon verified.)

## Engine vs. consumer split

The engine owns the **Exhaustion accounting**; the **trigger** (is this creature out of breath / choking?) and the 1+CON-minute breath-hold are the consumer's environmental model — the engine doesn't know the scene is underwater / airless. So both arms are consumer-driven planners, mirroring the `tickRecurring*` family:

- **`engine.plan.tickSuffocation(characterId)`** — called once at the end of each turn the creature can't breathe. +1 Exhaustion level, recorded against the new reversible **`Character.suffocationExhaustionLevels`** counter. A tick at the lethal cap (6) is a no-op.
- **`engine.plan.recoverFromBreath(characterId)`** — called when the creature can breathe again. Removes **exactly** the accrued suffocation levels (`exhaustion - suffocationExhaustionLevels`, floored at 0) and resets the counter, leaving Exhaustion from other sources intact. No-op when nothing was accrued.

Both emit a new **`SuffocationExhaustionChanged`** event (`{ fromLevel, toLevel, suffocationDelta }`) whose reducer mirrors `applyExhaustionChanged` (same from-level invariant + lethal-at-6 kill via the shared `markCreatureDead`) and additionally maintains the counter (floored at 0). Reaching Exhaustion 6 by suffocating is fatal — RAW, long enough without air kills (via the level-6 death rule).

## State

New `Character.suffocationExhaustionLevels: number` (default 0; additive, old saves load clean — the two direct-construction sites in `spawn.ts` / `summons.ts` initialize it to 0). Event registered across the union / `EVENT_TYPES` / apply dispatch / transcript formatter; the two planners exposed on `engine.plan` and allowlisted in the planner-wiring audit as consumer-driven ticks.

## Tests

New `tests/unit/engine/slice-887-suffocation.test.ts` (6 tests): a tick adds 1 Exhaustion + records the counter; successive ticks accumulate; recovery removes exactly the suffocation levels; recovery **preserves Exhaustion from other sources** (start at 2, suffocate to 4, recover back to 2); recovery with nothing accrued is a no-op (no event); ticking to Exhaustion 6 is fatal (HP 0) and a further tick is a no-op.

## Counts

No count change — no new condition, EFFECT_KIND, or wired spell. (The new event isn't a doc-counted surface.)

## Audit

- Struck `no-suffocation` (Area 8 QUIRK).
- Rollup: **Area 8** `4 → 3` open / `10 → 11` closed / `0/0/4 → 0/0/3`; **Total** `31 → 30` open / `86 → 87` closed / `0/11/20 → 0/11/19`. "Updated through slice 887."

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (661 files, 4919 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
