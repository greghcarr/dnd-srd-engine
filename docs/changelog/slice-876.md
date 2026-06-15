# Slice 876 — Shocking Grasp's "can't make Opportunity Attacks" rider

**Type:** Engine (an OA-emission/resolution guard) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 quirk `shocking-grasp-no-oa-denial`.

## The gap

RAW (SRD 5.2.1 Shocking Grasp): "On a hit, the target takes 1d8 Lightning damage, and **it can't make Opportunity Attacks until the start of its next turn**." The damage was wired (an attack cantrip); the OA-denial wasn't. The audit flagged it as needing "a new effect kind + a gate in the OA reaction planner."

## The fix — reuse the Addle shape (no new effect kind)

Monk Open Hand's "Addle" (`addled`) already has the exact same "can't make Opportunity Attacks until its next turn" semantics — modeled as an effect-less marker the OA *resolution* planner reads by id. So Shocking Grasp reuses that shape instead of adding a primitive:

- A new effect-less **`shocking-grasped`** condition, applied via the attack mechanic's existing `conditionOnHit` (slice 666), with `endsOn: turnEnd(self)` (the `addled` window).
- A shared **`cannotMakeOpportunityAttack(character)`** guard in `_actor-state.ts` over an `OA_PREVENTING_CONDITIONS` set (`addled` + `shocking-grasped`), composed with the existing action-blockers.
- The OA **emission** (`planMove`) now uses that guard, and the OA **resolution** (`planOpportunityAttack`) rejects a `shocking-grasped` reactor (parallel to the existing `addled` rejection, preserving the per-condition error messages).

**Pattern-check.** `addled` was previously read *only* at the OA resolution — so an Addled creature was still *offered* an OpportunityAvailable in the emission (then rejected if dispatched). Folding `addled` into the shared guard means it's now suppressed in the emission too, closing that inconsistency.

## What shipped

- `cannotMakeOpportunityAttack` + `OA_PREVENTING_CONDITIONS` (`_actor-state.ts`); the emission guard in `movement.ts`; the `shocking-grasped` rejection in `opportunity-attack.ts`.
- Content: `shocking-grasp` gains `conditionOnHit: 'shocking-grasped'`; the new effect-less `shocking-grasped` condition (added to pack-integrity's `EFFECT_LESS_OK` allowlist, like `addled`).
- New 5-test `tests/unit/engine/slice-876-shocking-grasp-oa.test.ts`: the wire; a hit applies `shocking-grasped`; a positioned mover leaving reach does NOT offer the grasped reactor an OA (the free reactor gets one); the addled-emission pattern-check; and the OA-resolution rejection.
- Counts: +1 condition (`175 → 176` total / `160 → 161` rider). Shocking Grasp stays in the spell-wired count (already wired — this closes a missing arm); no new effect kind, so the primitive count is unchanged; the wired-conditions snapshot is unchanged (the marker is effect-less).

## Verification

`npx tsc --noEmit` clean; new 5-test slice-876 green; the slice-380 Addle OA test + pack-integrity green. `npm run test:fast` (653 files, 4881 passed — +1 file / +5 tests over slice 875). doc-counts + doc-size + doc-links green. The OA emission/resolution are unchanged for every creature without an OA-preventing condition.
