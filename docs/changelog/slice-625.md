# Slice 625 — Martial Arts Die scales monk weapons too, not just unarmed strikes (closes the slice-623 sibling gap)

**Type:** Engine + tests.

The slice-624 fuzz review caught it (seed 5508): a monk wielding a sickle (1d4, Light simple melee → monk-eligible) still rolled the sickle's 1d4 when the L1 Martial Arts die is 1d6. RAW 2024 ([../../references/srd-markdown/classes.md](../../references/srd-markdown/classes.md) Martial Arts → Martial Arts Die): *"You can roll 1d6 in place of the normal damage of your Unarmed Strike **or Monk weapons**."* Slice 623 fixed the **Dexterous Attacks** arm of Martial Arts (STR→DEX on monk weapons) via the `martialArtsApplies` helper but missed widening the **die-scaling** arm — `applyMartialArtsDieScaling` still had the narrow `weaponDefId !== 'unarmed-strike'` early-return.

## Fix

[../../src/engine/plan/attack.ts:391](../../src/engine/plan/attack.ts#L391): `applyMartialArtsDieScaling` now keys off `martialArtsApplies(character, weapon)`, the same RAW gate slice 623 added (monk level ≥ 1 + monk-eligible weapon + no armor + no shield). Both Martial Arts arms now share the gate. Signature widened from `({ classes }, weaponDefId, ...)` to `(Character, Weapon, ...)`; the two call sites ([attack.ts:1149](../../src/engine/plan/attack.ts#L1149), [offhand-attack.ts:264](../../src/engine/plan/offhand-attack.ts#L264)) already had `attacker` and `weaponDef` in scope — no plumbing required.

## Tests

[../../tests/unit/engine/slice-625-martial-arts-die-on-monk-weapons.test.ts](../../tests/unit/engine/slice-625-martial-arts-die-on-monk-weapons.test.ts), 5 cases: L1 monk sickle → 1d6 (not 1d4); L5 monk sickle → 1d8; armored monk → 1d4 (RAW gate strips Martial Arts); monk with greatsword (martial 2H → NOT monk-eligible) → 2d6 native; unarmed strike still scales (the original path).

## Verification

`npx tsc --noEmit` clean, full suite green. Re-running fuzz seed 5508 confirms Bran's sickle now rolls 1d6.

## RNG impact

Monk attacks with monk weapons (sickle, dagger, scimitar, shortsword, club, light-hammer, javelin, dart) now use the larger Martial Arts die. Larger dice → different damage rolls per seed (no extra d20s consumed). Same per-seed determinism-shift class as slices 623/624.

## Audit

- **Names**: reuses `martialArtsApplies` from slice 623; both arms now share the gate.
- **DRY**: removed the duplicate `unarmed-strike` check in favor of the shared helper.
- **Pattern-check**: this was the **sibling bug** to slice 623's Martial Arts fix. The engine had implemented BOTH arms (Dexterous Attacks + Martial Arts Die) narrowly (unarmed-only); slice 623 widened one arm, slice 625 widens the other. Grepped `src/engine/plan/` and `src/derive/` for other "monk + unarmed-strike" early-returns — none remain. Martial Arts L1 is now complete.
- **Tests**: each case pins one RAW shape (no-armor scaling, armored loses, non-monk-weapon stays native, unarmed unchanged).

## Open follow-ups

The L5+ monk's Bonus Unarmed Strike (Martial Arts → Bonus Unarmed Strike arm) is an action-economy benefit, not a damage benefit; remains separate. Slice-624's open items still apply (on-hit masteries' damage > 0 gate; s23 mislabeled Graze test).
