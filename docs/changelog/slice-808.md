# Slice 808 — Grappler feat + Savage Attacker audit correction

**Type:** Engine fact + content (feat effects) + an audit reconciliation. **Closes** the [L7 audit](../l7-completion-audit.md) Area 5 divergence `grappler-feat-inert`, and **reclassifies** `savage-attacker-feat-inert` as a stale false-positive.

## Grappler feat (was inert)

The Grappler feat shipped `effects: []` — it did nothing. RAW (feats.md): +1 STR or DEX, *"Advantage on attack rolls against a creature Grappled by you"* (plus the Punch-and-Grab action-economy and Fast-Wrestler movement arms, deferred). Now authored:

- **Ability Score Increase** — an `OfferChoice` (STR or DEX +1, max 20), the same `IncreaseAbilityScore` primitive the ASI feat uses.
- **Attack Advantage** — a `SetAdvantage { on: 'attack', mode: 'advantage' }` gated on a new attack-planner fact **`event.targetGrappledByAttacker`** (true when the target carries a `grappled` condition whose `sourceCharacterId` is this attacker). Folds into the existing `attackerSelfAdvantageFacts` map, so 2024 advantage-cancellation applies normally.

## Savage Attacker — stale audit false-positive

The audit row `savage-attacker-feat-inert` claimed the feat's `effects: []` meant its reroll "never fires." That's wrong: **slice 467 implemented Savage Attacker** (and `tests/unit/engine/slice-467-savage-attacker.test.ts` covers it). It works via the `AttackIntent.useSavageAttacker` opt-in + a check that `savage-attacker` is on the effective feat list (auto-projected from the background's `originFeatId`) + the `savageAttackerUsedThisTurn` per-turn gate. The empty `effects` array is **correct** — the feature is a per-attack reroll, not an effect-stack contribution. The audit was compiled 2026-06-09, before slice 467 landed. Row reclassified (no code change needed).

## Tests

`tests/unit/engine/slice-808-grappler-feat.test.ts` (3): the feat ships the ASI choice + the advantage `SetAdvantage`; the grappler has Advantage attacking a creature it has Grappled (`used: 'advantage'`); and no advantage against a non-grappled target or one grappled by someone else. Coverage snapshot: +`general:grappler` (now a wired feat).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (591 files, 4538 passed).
