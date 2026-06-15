# Slice 880 — `no-hostility-model`: the ranged-in-melee hostility override (Area 4 fully closed)

**Type:** Engine (attack planner + consumer-coordinated fact slot). Closes the L7 audit Area-4 quirk `no-hostility-model` — the last open Area-4 row. **Area 4 (Core combat correctness) is now fully closed.**

## RAW

PHB ch.1 "Ranged Attacks in Close Combat": *"You have Disadvantage on the attack roll if you are within 5 feet of a HOSTILE creature who can see you and who isn't Incapacitated."*

## What was wrong

The engine has no hostility model (who is friend vs. foe is a consumer/narrative fact — see [engine-scope.md](../engine-scope.md)). Two geometry-derived facts in the attack planner therefore treated **any** adjacent creature as hostile:

1. **Ranged-in-melee disadvantage** (`rangedInMelee`) — imposed disadvantage whenever any non-incapacitated combatant was within 5 ft of the attacker, so an archer standing next to a *friendly* cleric wrongly took disadvantage. This arm had **no consumer override**.
2. **The auto-derived Pack-Tactics / flank fact** (`positionDerivedAllyAdjacent`) — treats any adjacent creature as an ally. This arm **already** had a per-intent override (`attackerHasAllyAdjacentToTarget`, slice 445), so a faction-aware consumer could already correct it.

The only un-closeable half was the ranged-in-melee arm.

## The fix

Added `attackerHasHostileAdjacent?: boolean` to `AttackIntent` / `ResolveAttackInput`, the symmetric mirror of `attackerHasAllyAdjacentToTarget`:

- `rangedInMelee` is now `input.attackerHasHostileAdjacent ?? positionDerivedRangedInMelee` (only for ranged weapons; inert for melee). The geometry computation became the named fallback `positionDerivedRangedInMelee`.
- `true` → a hostile creature is within 5 ft (disadvantage applies, even if the engine can't see it).
- `false` → no hostile within 5 ft (no disadvantage, even with a friendly adjacent — the fix).
- `undefined` → conservative any-adjacent geometry (prior behavior, byte-unchanged).

Threaded through the `planAttack` → `resolveAttackRollPhase` mapping alongside the existing fact slots. It's purely a planner input (folded into the disadvantage computation), so no event/dispatch surface and no content changes.

With both geometry-blind arms now carrying a per-intent consumer override, the "Consumer can override per-intent" close holds for the whole row.

## Tests

New `tests/unit/engine/slice-880-ranged-in-melee-hostility.test.ts` (5 tests, positioned 3-combatant encounter — shortbow archer, an adjacent friendly, a distant target): friendly adjacent + `false` → no disadvantage (`used: 'none'`); adjacent + no override → geometry still imposes disadvantage (prior behavior); friendly adjacent + `true` → disadvantage; nobody adjacent + `true` → disadvantage (a hidden foe); nobody adjacent + no override → `none`.

## Pattern-check

The audit named exactly two hostility-blind geometry sites; the Pack-Tactics/flank arm already had its override (slice 445), and OA emission is RAW-agnostic (an OA isn't hostility-gated — the consumer chooses whether to take the offered reaction). No other "any-adjacent = hostile/ally" derivation lacks an override.

## Counts

No count change — no new condition, effect kind, or wired spell. The new field is a plain optional `AttackIntent` input (no schema/Zod surface). `doc-counts` untouched.

## Docs

- Struck `no-hostility-model`; Rollup: **Area 4** `1 → 0` open / `11 → 12` closed → status flips to ✅ **fully closed**; **Total** `37 → 36` open / `80 → 81` closed / `0/13/24 → 0/13/23`. Header now reads "Areas 1, 4, and 7 are fully closed"; "Recommended order" prose updated (residual quirks now Area 5 / 6 only).
- Registered the new fact slot in the three consumer-facing registries: [engine-scope.md](../engine-scope.md) "Consumer-coordinated fact slots", [starter-pack-gaps.md](../starter-pack-gaps.md) (table row + call-site + default-behavior bullets), and [api-overview.md](../api-overview.md) consumer-supplied facts list.

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (656 files, 4896 passed / 166 skipped). `doc-size` + `doc-links` + `doc-counts` audits green.
