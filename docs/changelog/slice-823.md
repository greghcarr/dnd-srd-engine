# Slice 823 — monster on-hit rider pass (batch 2: lycanthropy + save/condition riders)

**Type:** Content (a new marker condition + 7 natural-weapon `onHit` riders). No engine change. Advances the [L7 audit](../l7-completion-audit.md) `monster-onhit-rider-pass` quirk.

## What shipped

Batch 1 (slice 822) did the *automatic* size-gated grapple/prone riders. Batch 2 does the on-hit **save / condition** riders that fit existing machinery — the `onHit.save.conditionOnFail` path (slice 318/319) and unconditional `applyConditionId` (slice 321):

### Were-creature lycanthropy (new `lycanthropy-cursed` marker condition)

The five lycanthrope bites — **Werebear, Wereboar, Wererat, Weretiger, Werewolf** — share one RAW shape: *"Melee Attack Roll. Hit: damage. If the target is a Humanoid, Constitution Saving Throw DC N. Failure: the target is cursed."* Wired as an `onHit` rider with a `condition` gate (`target.creatureType === 'Humanoid'`) + a `save` (`{ ability: 'CON', dc, conditionOnFail: 'lycanthropy-cursed' }`), DCs 14/12/11/13/12 respectively (Wereboar's curse rides its **Gore**, RAW).

The new **`lycanthropy-cursed`** condition is an inert marker: RAW the curse does nothing until the cursed creature drops to 0 HP, at which point *"it instead becomes the were-creature, under the GM's control with 10 Hit Points."* That transformation is a death-replacement + creature-swap that's GM/consumer territory (the engine can't auto-transform), so the engine records the curse (sourced by the attacker) and leaves the rest to the consumer — `effects: []`. A single marker suffices; which were-form is the attacker's identity.

### Unconditional condition riders (existing conditions)

- **Cloud Giant Thundercloud** (ranged) → the target has the **Incapacitated** condition.
- **Oni Nightmare Ray** (ranged) → the target has the **Frightened** condition.

(The audit row had filed "Oni frightened" under *new* condition defs — it's the Nightmare Ray riding the existing `frightened`, not a new condition.)

Each rider was SRD-verified against `monsters-A-Z.md`; the now-accurate effect is reflected in each weapon's player-facing `description` (replacing the stale "Deferred" note). Lycanthropy is RAW-current — the 2024 SRD keeps the cursed-on-bite mechanic — so this is not edition drift.

## Still open (tracked)

(a) The save-based **Constrict** actions (Behir/Couatl/Marilith/Giant Constrictor — a `StrengthSavingThrow` *action*, not a weapon on-hit rider); (b) **Bearded Devil `infernal-wound`** (recurring HP-loss at turn-start — needs a new condition *and* a new recurring-damage mechanism); (c) the Chimera / Djinni save-or-condition actions.

## Tests

`tests/unit/engine/slice-823-lycanthropy-and-onhit-conditions.test.ts` (6): the marker condition + the 7 riders ship with the expected shape; the curse gate reads Humanoid vs non-Humanoid (a Skeleton is Undead); a Werewolf Bite curses a Humanoid on a failed CON save (sourced by the werewolf) but rolls no save and applies no curse against an Undead target; Cloud Giant Thundercloud incapacitates and Oni Nightmare Ray frightens on a hit.

## Verification

`npx tsc --noEmit` clean; the player-facing-descriptions lint + pack-integrity + coverage snapshots green; `npm run test:fast` green.
