# Slice 874 — Acid Arrow: half-on-miss + the delayed 2d4 drip

**Type:** Engine (a `halfDamageOnMiss` flag on the attack mechanic) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `acid-arrow-no-delayed-or-miss`.

## The gap

RAW (SRD 5.2.1 Acid Arrow, Wizard L2): "Make a ranged spell attack against the target. On a hit, the target takes 4d4 Acid damage **and 2d4 Acid damage at the end of its next turn**. **On a miss**, the arrow splashes the target with acid for **half as much of the initial damage only**." The engine dealt a flat 4d4 on a hit — nothing on a miss, and no delayed damage.

## The fix — two arms, both reusing shipped machinery

- **Half on a miss** — a new opt-in **`halfDamageOnMiss`** flag on the `attack` mechanic. On a miss it deals `floor(rolled / 2)` instead of skipping the target. It folds into the existing Evoker **Potent Cantrip** half-on-miss path (one shared `halfOnMiss` branch), so the damage outcome reuses the same `halveDamage` chokepoint; `conditionOnHit` still fires only on a hit.
- **The delayed 2d4** — reuses the slice-825 `recurringDamage`. `conditionOnHit: 'acid-arrow-burning'` applies a new condition (on a hit only) carrying `recurringDamage{2d4 acid, turnEnd}`; the consumer ticks `tickRecurringDamage` once at the **target's** turn-end for the drip, and the condition's bearer-keyed `autoExpiry { afterRounds: 1, turnEnd, expirySourceFromBearer: true }` lifts it so it fires exactly once.

The `4d4` initial + the `extraDicePerSlotLevel: 1` upcast on it are unchanged. The **+1d4-per-slot upcast on the *delayed* die** is deferred (a condition's `recurringDamage` dice are static, as with the smites).

## What shipped

- `SpellAttackMechanicSchema.halfDamageOnMiss`; the shared `halfOnMiss` branch in `planAttackMechanic` (`cast-spell.ts`).
- Content: `acid-arrow` rewired (`halfDamageOnMiss: true`, `conditionOnHit: 'acid-arrow-burning'`); the new `acid-arrow-burning` condition (`recurringDamage{2d4 acid, turnEnd}` + bearer-keyed 1-round autoExpiry; `effects: []`).
- New 3-test `tests/unit/engine/slice-874-acid-arrow.test.ts`: the wire + the condition's `recurringDamage` shape; across seeds, a hit deals the full rolled 4d4 + applies the lingering condition while a miss deals exactly half + no condition; the ticked drip is 2d4 Acid.
- Counts: +1 condition (`174 → 175` total / `159 → 160` rider). acid-arrow stays in the spell-wired count (it was already wired — this is a missing-arm close, not a deferred→wired flip), so no spell-wired/pct change; the wired-conditions snapshot is unchanged (the condition is effect-less, driven by `recurringDamage`).
- CHANGELOG size discipline: evicted slices 837-842 to [archive-slices-837-842.md](archive-slices-837-842.md) (the live file was approaching the 60 KB ceiling).

## Verification

`npx tsc --noEmit` clean; new 3-test slice-874 green; spell-coverage green (acid-arrow's attack harness unchanged). `npm run test:fast` (651 files, 4872 passed — +1 file / +3 tests over slice 873). The `halfDamageOnMiss` flag is opt-in, so every other attack spell (and the Potent-Cantrip path) is byte-unchanged. doc-counts + doc-size + doc-links green.
