# Slice 782 — edition drift: Heavy-weapon disadvantage is the 2024 STR/DEX-13 rule (not the 2014 Small-creature rule)

**Type:** Engine edition-drift fix (`src/engine/plan/attack.ts`). Second of the [L7 audit](../l7-completion-audit.md) Area 1 sweep; closes **two** rows — `small-creature-heavy-disadvantage` (Area 1, DIVERGENCE) **and** `heavy-property-str-dex` (Area 6, BLOCKER). No API or content change.

## The bug

The attack planner imposed the **2014** rule "Small creatures have Disadvantage with Heavy weapons" (`heavyForSmall`, gated on `creatureSize(attacker) === 'Small'`), and did **not** implement the 2024 replacement at all. So a Small halfling with STR 16 wrongly rolled Heavy attacks at Disadvantage, while a Medium STR-8 wizard swinging a greatsword rolled normally — both backwards from SRD 5.2.1.

## The fix

Canon ([`references/srd-markdown/equipment.md`](../../references/srd-markdown/equipment.md), Heavy property): *"You have Disadvantage on attack rolls with a Heavy weapon if it's a Melee weapon and your Strength score isn't at least 13, or if it's a Ranged weapon and your Dexterity score isn't at least 13."*

- Removed `heavyForSmall` (the 2014 size branch).
- Added `heavyWeaponBelowThreshold`: for a Heavy weapon, check the relevant **effective** ability score (STR for melee, DEX for ranged) against `HEAVY_WEAPON_MIN_ABILITY = 13`. Using the effective score (via `attackerEffects` floor/increase, the same path the damage modifier uses) means a Belt of Giant Strength lifts the wielder past the threshold, matching RAW intent. Size no longer factors in.

## Tests

- **New** `tests/unit/engine/slice-782-heavy-weapon-2024.test.ts`: melee Heavy + STR 12 → disadvantage; STR 13 (threshold) → none; ranged Heavy + DEX 12 → disadvantage; DEX 13 → none; non-Heavy weapon + STR 8 → none.
- `tests/audit/raw-compliance.test.ts`: the Tier-2 probe flipped from "Small + Heavy → disadvantage" (2014) to "STR < 13 + Heavy melee → disadvantage" (2024).
- `tests/unit/engine/slice-560-human-tiefling-size.test.ts`: the three "Small + Greatsword (STR 16)" downstream cases now assert **no** disadvantage — size is decoupled from Heavy. (The Medium control was already `none`.)
- `tests/unit/engine/slice-561-final-l1-closures.test.ts`: the structural smoke check now pins the `heavyWeaponBelowThreshold` / `HEAVY_WEAPON_MIN_ABILITY` block and asserts `heavyForSmall` is gone.

## Verification

`npx tsc --noEmit` clean; full `npx vitest run` green.
