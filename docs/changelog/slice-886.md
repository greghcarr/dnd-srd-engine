# Slice 886 — the general Unseen Attackers and Targets rule (`unseen-attacker-general-rule`)

**Type:** Engine (attack planner advantage netting) + two consumer LoS fact slots. Closes the L7 audit Area-3 DIVERGENCE `unseen-attacker-general-rule`.

## RAW

Unseen Attackers and Targets (playing-the-game):
- *"When you make an attack roll against a target you can't see, you have Disadvantage on the roll."*
- *"When a creature can't see you, you have Advantage on attack rolls against it."*

## What was wrong

The engine produced these advantage/disadvantage swings **only** through the Invisible *condition* (`canLocateInvisible` etc.). The general rule — which fires for darkness, heavy obscurement, Blinded, hiding, etc. — had no channel: `AttackIntent` had no `attackerCanSeeTarget` fact, and the existing `targetCanSeeAttacker` fact was consumed only by Dodge (to suppress its disadvantage), never to grant the unseen-attacker **Advantage**.

## The fix

Two consumer-supplied line-of-sight facts (the engine doesn't model sight), folded into the same 2024 advantage/disadvantage cancellation as every other source:

- **New `AttackIntent.attackerCanSeeTarget?`** — `false` → the attacker can't see the target → **Disadvantage** (added to `targetImposesDisadvantage`). `true` / undefined → no change. An attacker whose blindsight/tremorsense/truesight defeats the obscurement passes `true`.
- **Extended `targetCanSeeAttacker`** — `false` now ALSO grants the attacker **Advantage** (added to `effectivelyGrantsAdvantage`, so it's correctly suppressed by Elusive), on top of its existing Dodge-bypass role. Opt-in: only explicit `false` grants advantage.

Both are opt-in: an attack that passes neither fact is byte-unchanged (the whole suite + every golden is unaffected). Mutual blindness (both `false`) nets to a straight roll via the existing cancellation.

## Tests

- New `tests/unit/engine/slice-886-unseen-attacker.test.ts` (5 tests): attacker who can't see the target → Disadvantage; attacker the target can't see → Advantage; mutual blindness → straight roll (1 d20); no facts → straight roll (opt-in); explicit `true`/`true` → nothing.
- Updated `tests/unit/engine/dodge-los-gate.test.ts`: the `targetCanSeeAttacker=false` case asserted `used: 'none'` (it accounted only for the Dodge-bypass, not the unseen-attacker Advantage). RAW, a dodging target that can't see the attacker means the attacker has Advantage — the assertion is now `'advantage'` (2 d20). A net RAW-correctness improvement.

## Deferred

Threading the LoS facts through the cast-spell **spell-attack** path (a ranged spell attack vs an unseen target) — a separate consumer seam, same shape as the slice-885 cover deferral. The audit row scopes to `src/engine/plan/attack.ts`, which this closes.

## Counts

No count change — two plain optional `AttackIntent` inputs; no new condition / effect kind / wired spell.

## Docs

- Struck `unseen-attacker-general-rule`; Rollup: **Area 3** `12 → 11` open / `2 → 3` closed / `0/5/7 → 0/4/7`; **Total** `32 → 31` open / `85 → 86` closed / `0/12/20 → 0/11/20`.
- Registered `attackerCanSeeTarget` + the extended `targetCanSeeAttacker` semantics in the three consumer-facing registries: [engine-scope.md](../engine-scope.md), [starter-pack-gaps.md](../starter-pack-gaps.md), [api-overview.md](../api-overview.md).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (660 files, 4913 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
