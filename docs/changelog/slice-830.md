# Slice 830 — Djinni Create Whirlwind (caught condition + catch save-action)

**Type:** Content (one condition + one save-action) + a test-audit fix. Closes the Djinni arm of the [L7 audit](../l7-completion-audit.md) `monster-whirlwind-actions` quirk — and with it the whole `monster-onhit-rider-pass` lineage.

## The gap

The Djinni Create Whirlwind (SRD 5.2.1, CR 11) is not a save-or-grapple action like the Constrict / Air Elemental shapes — it's a **persistent, Concentration-sustained, moving hazard**:

> The djinni conjures a whirlwind … a 20-foot-radius, 60-foot-high Cylinder … lasts until the djinni's Concentration on it ends. The djinni can move the whirlwind up to 20 feet at the start of each of its turns. Whenever the whirlwind enters a creature's space or a creature enters the whirlwind … *Strength Saving Throw:* DC 17 … *Failure:* While in the whirlwind, the target has the Restrained condition and moves with the whirlwind. At the start of each of its turns, the Restrained target takes 21 (6d6) Thunder damage. At the end of each of its turns, the target repeats the save, ending the effect on itself on a success.

The engine doesn't model positions, conjured areas, or non-spell monster Concentration — so the **placement, the cylinder, its movement, area membership, and the Concentration upkeep all stay consumer/DM-owned** (the same seam as every other positional fact). What the engine *can* own is the **per-creature caught effect**, and it decomposes cleanly into existing machinery.

## What shipped (no new engine code)

### The caught condition

A new `djinni-whirlwind-caught` condition that carries:
- **Restrained's effects** directly (speed 0, Disadvantage on attacks + Dex saves, Advantage to attackers) — RAW "has the Restrained condition";
- **`recurringDamage` {6d6 thunder, turnStart}** (slice 825's no-save tick) — "21 (6d6) Thunder at the start of each of its turns"; the consumer ticks `engine.plan.tickRecurringDamage` at the bearer's turn-start;
- **`recurringSave` {STR fixedDC 17, turnEnd, removeCondition}** — "repeats the save at the end of each of its turns, ending the effect on a success"; the consumer ticks `engine.plan.tickRecurringSave` at the bearer's turn-end.

No `autoExpiry` — the whirlwind ends when the djinni's Concentration ends (consumer-managed), not after a fixed count.

### The catch save-action

A `create-whirlwind` save-action on the Djinni (slice-828 mechanism): STR DC 17, no `maxTargetSize` (RAW has no size clause), `onFail.applyConditionIds: ['djinni-whirlwind-caught']`, no immediate damage. The consumer dispatches it whenever a creature enters/starts in the whirlwind (once per turn); a failure applies the caught condition sourced to the djinni (so "moves with the whirlwind" attribution + the recurring-damage source resolve).

### Reachability-walker fix (pattern-check)

The pack-integrity "conditions are reachable" walker scanned `applyConditionId` (singular) but not the slice-828 save-action `onFail.applyConditionIds` (plural). `djinni-whirlwind-caught` is the first condition reachable *only* via the plural array, so the walker now reads it (mirroring its existing `eligibleConditionIds` array handling) — otherwise the condition would false-orphan. This is the doc's own "walk every reference path" lesson.

## Docs / counts

New condition → conditions **165 → 166** (151 rider); bumped the three doc-cited counts (getting-started, status, starter-pack-gaps) and the wired-conditions coverage snapshot (one line: `+ "djinni-whirlwind-caught"`).

## Tests

`tests/unit/engine/slice-830-djinni-create-whirlwind.test.ts` (6): the condition carries Restrained's effects + the two recurring arms; the save-action is STR DC 17 / applies the caught condition / no immediate damage; a failed catch applies the condition sourced to the djinni with no damage; a successful catch does nothing; a caught creature takes 6d6 Thunder via `tickRecurringDamage` (sourced to the djinni); and the end-of-turn STR save removes the condition on a success (`tickRecurringSave`).

## Verification

`npx tsc --noEmit` clean; pack-integrity (reachability + the new save-action condition guard) + doc-counts green; `npm run test:fast` green (611 files, 4651 passed).
