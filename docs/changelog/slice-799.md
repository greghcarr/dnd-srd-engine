# Slice 799 — heavy-armor Strength-requirement speed penalty

**Type:** Engine derivation (read an authored-but-ignored field). **Closes** the [L7 audit](../l7-completion-audit.md) Area 6 divergence `armor-str-requirement-speed`.

## The gap

RAW `equipment.md` "Strength": *"If the table shows a Strength score in the Strength column for an armor type, that armor reduces the wearer's speed by 10 feet unless the wearer has a Strength score equal to or higher than the listed score."* Chain Mail needs 13; Splint and Plate need 15. The `strRequirement` field was authored on those armors but **`getEffectiveSpeed` never read it** — an under-STR character in Plate kept their full 30 ft.

## The fix

`getEffectiveSpeedForMode` (`src/derive/speed.ts`) now applies a −10 walk-speed penalty when the equipped armor lists a `strRequirement` the wearer doesn't meet:

- **Effective Strength**, not base — built from the same `effectiveAbilityScore(base, floor, increase)` path the rest of the derive layer uses, so a STR ASI, a STR floor, or Gauntlets of Ogre Power count toward meeting the requirement. The effect stack is built **only** when an armor with a `strRequirement` is actually worn (early-out keeps the common path off the heavier accumulator).
- **Walk mode only** — RAW names "the wearer's speed" (the walking Speed); fly/swim/climb are separate entries the rule doesn't touch.
- **Folded into the natural base** (`base + addSum + armorStrPenalty`) so a later multiplier (Haste ×2) doubles the already-reduced Speed per the RAW reading; a `set` override (Phantom Steed) replaces Speed and so ignores it. Clamped to ≥ 0, and it stacks with the exhaustion −5/level penalty.

No new schema or content — reading a field that was already there.

## Tests

`tests/unit/derive/slice-799-armor-str-speed.test.ts` (5): Chain Mail (Str 13) penalizes STR 12 (→20) but not 13/16 ("equal to or higher"); Plate + Splint (Str 15) penalize 13/14 but not 15; armor without a requirement (Studded Leather) and no-armor never penalize; **effective STR** — a +2 background increase lifts base 13 to 15 and meets Plate; and the penalty stacks with exhaustion (Chain Mail + STR 8 + exhaustion 1 → 30 − 10 − 5 = 15).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (582 files, 4502 passed) — no movement/speed test regressed.
