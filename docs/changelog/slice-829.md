# Slice 829 — Air Elemental Whirlwind (save-action: Recharge + forced push)

**Type:** Engine extension + canonical content user. Advances the [L7 audit](../l7-completion-audit.md) `monster-whirlwind-actions` quirk (the Air Elemental arm).

## The gap

Slice 828's `saveActions` mechanism (Constrict) modeled the single-target, no-recharge, condition-primary save-action. The **Air Elemental Whirlwind** is the same auto-hit save-or-effect shape with two arms the Constrict family didn't exercise (SRD 5.2.1):

> **Whirlwind (Recharge 4–6).** *Strength Saving Throw:* DC 13, one Medium or smaller creature in the elemental's space. *Failure:* 24 (4d10 + 2) Thunder damage, and the target is pushed up to 20 feet straight away from the elemental and has the Prone condition. *Success:* Half damage only.

`halfDamageOnSuccess` already shipped on the spec (slice 828). What was missing: **Recharge** gating and the **forced push**.

## What shipped

### Two additive arms on the save-action mechanism

- **`SaveActionSpec.recharge` (`{ rechargeMin }`)** — the same Recharge economy as `breathWeapon`. When present, `planSaveAction` emits a `SaveActionExpended` marker on use (gated on the action being available — the re-fire throws while expended), and `planSaveActionRechargeAtTurnStart` (the sibling of `planBreathWeaponRechargeAtTurnStart`) rolls a d6 at the bearer's turn-start and emits `SaveActionRecharged` on a roll ≥ `rechargeMin`. State lives on the new **`Character.expendedSaveActionIds`** (a per-id list — a monster can carry more than one recharge action, unlike `breathWeapon`'s single boolean). Wired into the three turn-start sites in `planAdvanceTurn` / `planBeginFirstTurn` alongside the breath-weapon recharge.
- **`SaveActionSpec.onFail.pushFeet`** — emits a position-less `CreaturePushed` (the existing forced-movement informational event) on a failed save; the consumer applies the displacement, as with every forced move. The push lands only on a failure (never on a half-damage success), with the conditions.

New events `SaveActionExpended` / `SaveActionRecharged` (+ reducers, the apply.ts cases, the event union, and the transcript formatters) mirror the breath-weapon lifecycle pair, keyed by save-action id.

### Content — the Air Elemental Whirlwind

`saveActions: [{ id: 'whirlwind', STR DC 13, ≤Medium, reach 5, recharge {4}, onFail: { 4d10+2 thunder, [prone], pushFeet 20 }, halfDamageOnSuccess: true }]`. The Air Elemental is CR 5 (in scope). "In the elemental's space" is positional → the consumer resolves membership; `reachFeet 5` is the display hint (same posture as Constrict reach and every position-less reach value).

## Action economy (unchanged from slice 828)

Still consumer-owned. The Recharge gate already prevents re-use until the action recharges (the Whirlwind's defining economy); whether it *costs the action* on the turn it fires is the consumer's call, same as Constrict.

## Tests

`tests/unit/engine/slice-829-air-elemental-whirlwind.test.ts` (5): the spec matches RAW; a failed save deals thunder + Prone + a 20-ft push sourced to the elemental + the expend marker; a successful save deals half damage only (no Prone, no push); firing lands the id on `expendedSaveActionIds` and a re-fire throws; and the full encounter path (createEncounter → beginFirstTurn) recharges on a d6 ≥ 4, emitting `SaveActionRecharged` and clearing the expended id.

## Verification

`npx tsc --noEmit` clean (the new events forced the transcript formatter's exhaustive switch + the two literal monster-construction sites to add the field — both caught by the compiler); `npm run test:fast` green (610 files, 4645 passed). No new condition or effect kind (reuses `prone` / `thunder`), so no doc-counts bump; the migrations test confirms the new `expendedSaveActionIds` field (zod default `[]`) is back-compatible with existing snapshots.
