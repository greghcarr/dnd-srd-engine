# Slice 838 — Giant Spider Web (single-target Recharge save-action)

**Type:** Content (one recharge save-action). No engine change — the mechanism shipped in slice 829. Closes the [L7 audit](../l7-completion-audit.md) `single-target-recharge` quirk.

## The gap

The audit noted Recharge tracking existed only for breath weapons, not for single-target/condition Recharge actions — the canonical example being the **Giant Spider Web** (SRD 5.2.1, CR 1):

> **Web (Recharge 5–6).** *Dexterity Saving Throw:* DC 13, one creature the spider can see within 60 feet. *Failure:* The target has the Restrained condition until the web is destroyed (AC 10; HP 5; Vulnerability to Fire; Immunity to Poison and Psychic).

## What shipped

The **engine capability already existed**: slice 829 generalized Recharge off `breathWeapon` onto the slice-828 save-action mechanism — `SaveActionSpec.recharge`, the per-id `Character.expendedSaveActionIds`, and `planSaveActionRechargeAtTurnStart` wired into the three turn-start sites (for the Air Elemental Whirlwind). So this slice is **content**: the Giant Spider's Web wires as a save-action with `recharge: { rechargeMin: 5 }` — DEX DC 13, one creature, `onFail.applyConditionIds: ['restrained']`, no damage. The single-target Recharge save-or-condition now works end-to-end (expends on use, recharges at turn-start on a d6 ≥ 5).

The web object (AC 10/HP 5, fire-vulnerable) and the "Restrained until the web is destroyed" escape stay consumer/DM-managed — objects + escape are out of engine scope, the same seam as grapple escape DCs.

## Still deferred (separate shapes)

Recharge **weapon-attack** actions (the Giant Eagle / Roc "Rock" — an attack roll, not a save) and **area** Recharge saves (Giant Ape Boulder Toss, Basilisk Petrifying Gaze — breath-weapon-shaped, multi-target) are different shapes, noted on the audit row.

## Tests

`tests/unit/engine/slice-838-giant-spider-web.test.ts` (4): the Web spec (DEX DC 13, Recharge 5–6, Restrained, no damage); a failed save applies Restrained sourced to the spider with no damage + the expend marker; a successful save does nothing; and end-to-end Recharge — it expends on use (re-fire throws), and recharges at turn-start on a d6 ≥ 5.

## Verification

`npx tsc --noEmit` clean; pack-integrity green; `npm run test:fast` green (618 files, 4686 passed). No new condition / effect kind / event / weapon (reuses `restrained` + the slice-829 recharge mechanism) → no doc-counts bump.
