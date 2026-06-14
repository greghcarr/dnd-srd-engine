# Slice 861 — a creature that takes falling damage lands Prone

**Type:** Engine fix + golden regen (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-8 divergence `falling-no-prone`.

## The divergence

RAW (SRD 5.2.1, the **Falling** hazard):

> A creature that falls takes 1d6 Bludgeoning damage at the end of the fall for every 10 feet it fell, to a maximum of 20d6. **When the creature lands, it has the Prone condition unless it avoids taking any damage from the fall.**

`planFalling` applied the damage but never the Prone-on-landing condition, so a fallen creature stayed standing.

## The fix

After mitigation, the planner computes whether the fall actually dealt damage (`mitigated` total > 0) and, when it did, appends a `prone` `ConditionApplied` to the faller (after the `DamageApplied` and any concentration break). The "unless it avoids taking any damage" carve-out falls out naturally:

- **Feather Fall** (`GrantFallingProtection`) returns `[]` before any damage — no Prone.
- **Slow Fall** reducing the damage to 0 returns early — no Prone.
- **Full Bludgeoning Immunity** mitigates to 0 → `tookDamage` is false → no Prone.

The averaged-vs-rolled falling *damage value* is the separate `falling-averaged-not-rolled` quirk and is **unchanged** here (kept out to avoid the broad value-cascade that a rolled-damage change would push through every falling golden).

## What shipped

New 2-test `tests/unit/engine/slice-861-falling-prone.test.ts`: a 30-ft fall that deals damage applies `prone` to the faller, ordered *after* the `DamageApplied`; a fall fully avoided (Monk L4 Slow Fall reducing 30 ft to 0) returns `[]` with no Prone. The existing falling unit tests (Slow Fall, Feather Fall, Death Ward) stay green — they locate events by type, so the appended Prone doesn't disturb them.

**Goldens regenerated:**
- `s14-environmental` — purely additive: a "is now Prone" line after each fall (no value change).
- `showcase` — a Prone-driven **cascade**: Vex falls, lands Prone, and then attacks **while Prone**, so its Advantage is cancelled (net none) and **Sneak Attack drops** — a correct RAW consequence — which shifts the seeded RNG for the rest of the encounter. The transcript was regenerated and the replay stays equivalent. (Showcase cascades from correct mechanic changes are an accepted pattern, e.g. the slice-824 dragon-Rend change.)

## Verification

`npx tsc --noEmit` clean; new 2-test slice-861 green; the Slow Fall / Feather Fall / Death Ward unit tests unchanged; `s14-environmental` + `showcase` goldens regenerated (`-u`) and replay-equivalent. No content / condition / coverage-snapshot change. `npm run test:fast` (639 files, 4808 passed) + doc audits green.
