# Slice 743 — fix: Barbarian can't re-enter Rage while already raging

**Type:** Bug fix (planner guard + query prediction). Consumer-reported (dnd-web duel). Additive guard; non-raging paths byte-identical.

## The bug

In the dnd-web duel, a raging Barbarian could take the Rage Bonus Action again on the next turn (and the next), spending a Rage use each time, while already raging. RAW (SRD 5.2.1): Rage is entered once as a Bonus Action and persists (until the end of your next turn, extended each round by attacking / forcing a save / a Bonus Action, up to 10 minutes; ends early on Heavy armor or Incapacitated). You don't re-enter it while raging, and spending a second use back-to-back is illegal unless Rage actually ended.

## Fix (Scope A)

- [src/engine/plan/rage.ts](../../src/engine/plan/rage.ts): `planRage` now throws `"<name> is already raging"` when the barbarian already has the `raging` condition (checked before the resource spend). `RAGING_CONDITION_ID` is now exported for the query to share.
- [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts): the Rage descriptor's block hook (`rageReason`) returns `already-raging` when the `raging` condition is active (preceding the Heavy-armor block), so `engine.query.bonusActions` reports Rage as `enabled: false, reason: 'already-raging'`. dnd-web greys disabled bonus actions and shows the reason, so this reads as "Rage — already raging" instead of burning a use.

The planner is the source of truth (throws); the query predicts the same block so the affordance greys correctly.

## Deferred (Scope B, its own slice)

Rage's full duration/maintenance lifecycle is **not** modeled here: the `raging` condition stays applied until explicitly removed or a Long Rest, so it never auto-ends. Scope B (a separate slice, since it changes Rage lifetime and combat outcomes broadly): Rage lasts until the end of the barbarian's next turn, extends one round when they attacked an enemy / forced a save / spent a Bonus Action to extend, ends otherwise; 10-round cap; ends early on Heavy armor / Incapacitated. With B, re-entering becomes legal only when Rage genuinely dropped. Scope A is sufficient for the reported bug (a barbarian who attacks each turn would maintain Rage anyway, and the use-burning is stopped).

## Byte-identity

Non-raging / non-Barbarian paths are unchanged. The combat-fuzz AI takes Rage at most once per battle (`firstTurnBuffTried` is battle-lifetime), so it never re-rages while raging — the new throw never fires in the fuzz, and goldens/fuzz are byte-identical. The one existing test that re-raged in an encounter (slice-548 "BA already used") now correctly hits the preempting `already raging` reason and was updated.

## Files

- [src/engine/plan/rage.ts](../../src/engine/plan/rage.ts), [src/query/bonus-actions.ts](../../src/query/bonus-actions.ts).
- [tests/unit/engine/slice-743-rage-reentry.test.ts](../../tests/unit/engine/slice-743-rage-reentry.test.ts) (new): planRage throws when raging; succeeds for a non-raging barbarian; bonusActions offers Rage (enabled) when not raging and disables it with `already-raging` when raging.
- [tests/unit/engine/slice-548-rage.test.ts](../../tests/unit/engine/slice-548-rage.test.ts): the re-rage-in-encounter test updated to assert `already raging`.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green.

## Audit (Uncle Bob)

- **Single source of truth**: the planner enforces (throws); the query predicts the same block (no divergence).
- **SRD-faithful (to scope)**: stops the illegal re-rage; the duration/maintenance nuance is explicitly deferred to Scope B, not silently approximated.
- **Reuse**: shares `RAGING_CONDITION_ID`; the query block rides the existing `extraReason` / disabled-reason path (alongside Heavy-armor and the dash/disengage conflicts).
