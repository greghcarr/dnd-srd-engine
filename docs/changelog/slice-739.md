# Slice 739 — engine/content: Druid Elemental Fury (L7) + Cleric Potent Spellcasting closure

**Type:** Engine fact + content (uses existing primitives). Additive. Wires the Druid L7 stub and closes the Cleric Blessed Strikes Potent Spellcasting stub. L7 SRD-complete cycle.

SRD 5.2.1 Druid L7 Elemental Fury — choose one:
- *Potent Spellcasting.* Add your Wisdom modifier to the damage you deal with any Druid cantrip.
- *Primal Strike.* Once on each of your turns when you hit with a weapon (or a Beast form's attack in Wild Shape), the target takes an extra 1d8 Cold, Fire, Lightning, or Thunder damage (choose when you hit).

## What changed

- **New damage fact `event.spellLevel`** (the spell's level; 0 = cantrip) added to the cast-spell damage-modifier facts at both the attack/direct-damage site and the save site. Inert for every existing predicate (additive), so existing casts are byte-identical.
- Pack: Druid L7 `elemental-fury` gains an `OfferChoice` (oneOf 1, onAcquire):
  - **Potent Spellcasting** → `AddModifier { target: 'damage', value: { abilityMod: WIS }, condition: eq event.spellLevel 0 }`.
  - **Primal Strike** → four element variants (`primal-strike-{cold,fire,lightning,thunder}`), each an `OnEvent` AttackRolled rider (`attackerIsSelf` + `hit`, `oncePer: turn`) dealing `+1d8` of that element — the Divine Strike rider shape. The element is chosen at selection (the per-hit re-choice is the modeled approximation).
- **Pattern-check:** the same `event.spellLevel == 0` fact closes the previously-stubbed Cleric Blessed Strikes **Potent Spellcasting** arm (`AddModifier { value: WIS }`), which had shipped as `effects: []`.

No new effect kind (`AddModifier` + `OnEvent` already exist), so EFFECT_KINDS is unchanged.

## Scope / approximation

- Potent Spellcasting is gated on `event.spellLevel == 0` only. Since the effect is borne solely by a druid/cleric (its class feature), this is exactly "your cantrips" in the single-class case. A multiclass caster's *other-class* cantrip (or a racial cantrip) would also pick up the bonus — a minor over-grant consistent with the repo's approximation norms; tightening it would need an `event.castingClassId` fact.
- Primal Strike's "weapon or Wild Shape attack" uses the broad self-hit `AttackRolled` filter (same as Divine Strike).

## Files

- [src/engine/plan/cast-spell.ts](../../src/engine/plan/cast-spell.ts): `event.spellLevel` fact at the attack + save damage-modifier sites.
- [src/content/packs/starter-pack.json](../../src/content/packs/starter-pack.json): Druid L7 `elemental-fury` OfferChoice; Cleric `blessed-strikes` Potent Spellcasting arm wired.
- [tests/unit/engine/slice-739-elemental-fury.test.ts](../../tests/unit/engine/slice-739-elemental-fury.test.ts) (new): Potent Spellcasting adds WIS to a Druid attack cantrip; Primal Strike fires +1d8 once per turn on a weapon hit; Cleric Potent Spellcasting adds WIS to Sacred Flame.
- [tests/unit/engine/blessed-strikes.test.ts](../../tests/unit/engine/blessed-strikes.test.ts): updated the stale "Potent Spellcasting is a stub" comment.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: green. No EFFECT_KINDS change (no doc-counts bump); features coverage snapshot adds `druid L7 elemental-fury`.

## Audit (Uncle Bob)

- **Reuse**: rides the existing cast-spell damage-modifier query (the `AddModifier`/`event.*` fact pattern, alongside Empowered Evocation's `event.spellSchool`) and the Divine Strike `OnEvent` rider; no new primitive.
- **SRD-faithful**: +WIS to cantrip damage; +1d8 elemental once per turn on a weapon hit; element chosen at selection.
- **Pattern-check**: the new fact closes the sibling Cleric Potent Spellcasting stub in the same slice.
