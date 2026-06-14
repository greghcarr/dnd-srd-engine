# Slice 858 — auto-crit vs Paralyzed/Unconscious honors within-5-ft (no reach over-grant)

**Type:** Engine fix (no content). Closes the [L7 audit](../l7-completion-audit.md) Area-4 quirk `auto-crit-reach-overgrant`.

## The divergence

RAW (Paralyzed / Unconscious): "Any attack that hits the creature is a critical hit if the attacker is **within 5 feet** of the creature." Slice 568 modeled within-5 with a proxy:

```ts
if (weaponDef.attackKind !== 'melee') return false;  // melee == "within 5 ft"
```

But a **reach** weapon (glaive, halberd, pike, whip) is also melee and strikes at 10 ft — so a reach attack against a Paralyzed/Unconscious target at 10 ft auto-crit, which RAW forbids.

## The fix

Within-5 is now resolved in two tiers:

1. **Positioned** — when both combatants are positioned in an active encounter, use the real distance: `chebyshevDistance(attackerPos, targetPos) <= 5`. So a reach weapon used *adjacent* still auto-crits, and one striking at *10 ft* does not. This reuses the exact `chebyshevDistance` adjacency derivation the planner already uses for Pack Tactics and the ally-adjacent (Sneak Attack flank) fact.
2. **Position-less fallback** — when positions are unknown (the engine's positionless default), a **non-reach** melee weapon can only strike at 5 ft, so it always counts as within 5; a **reach** weapon might be at 6-10 ft, so it does **not** auto-crit. This fixes the over-grant; the rare adjacent-reach case needs positions to resolve precisely (and now does).

The trigger conditions are unchanged: Paralyzed (incl. `held-paralyzed-active` for Hold Person / Hold Monster, which compose Paralyzed in RAW), Unconscious, or HP ≤ 0 (the synthetic-unconscious case).

## What shipped

New 2-test `tests/unit/engine/slice-858-autocrit-reach.test.ts`:

- **Position-less** — at seed 1 both a longsword and a glaive hit a paralyzed victim with d20 `[10,10]` (paralyzed grants the attacker advantage), used 10 — a hit but **not** a natural crit, so any crit is the auto-crit. The longsword (non-reach) hit is `critical: true`; the glaive (reach) hit is `critical: false`.
- **Positioned** — a seed where the in-encounter glaive hits with a non-natural-crit roll is found by iteration; at that seed the glaive auto-crits with the victim placed at **5 ft** but not at **10 ft** (the position differs only by a no-RNG `CombatantMoved`, so the d20 matches).

The slice-568 / 805 / 611 / 575 auto-crit tests stay green — their attackers wield non-reach weapons (longsword / unarmed), so the proxy and the new logic agree.

## Verification

`npx tsc --noEmit` clean; new 2-test slice-858 green; the auto-crit + attack-path tests unchanged. No content / condition / coverage-snapshot change. `npm run test:fast` (637 files, 4804 passed) + doc audits green.
