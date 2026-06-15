# Slice 875 — Enlarge/Reduce weapon-damage rider (the `WeaponDamageDelta` primitive)

**Type:** Engine primitive (a new `EFFECT_KIND`) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `enlarge-reduce-no-damage-rider` — the last damage-pipeline primitive.

## The gap

RAW (SRD 5.2.1 Enlarge/Reduce):

- **Enlarge:** "The target's attacks with its enlarged weapons or Unarmed Strikes deal **an extra 1d4 damage** on a hit."
- **Reduce:** "deal **1d4 less damage** on a hit (this can't reduce the damage below 1)."

`enlarged-active` / `reduced-active` carried only the STR Advantage/Disadvantage (slice 849). The ±1d4 weapon-damage rider was unmodeled — `AddModifier` is flat (not dice), and `AddDamage` is an additive separate component of a fixed type, with no "subtract from the weapon's own damage, floor 1" form.

## The fix — one symmetric primitive

A new **`WeaponDamageDelta { dice, mode: 'add' | 'subtract' }`** effect (EFFECT_KINDS `69 → 70`), read by the attack planner off the attacker's effect stack and applied to the bearer's **own** weapon / Unarmed-Strike damage, of the weapon's own damage type. This is the `HalvesStrengthWeaponDamage` (Ray of Enfeeblement) precedent — a marker the attack planner reads after the weapon damage total — extended to a rolled ± die:

- `enlarged-active` carries `{ dice: '1d4', mode: 'add' }`; `reduced-active` carries `{ dice: '1d4', mode: 'subtract' }`.
- A `subtract` floors the weapon component at **1** (RAW "can't reduce the damage below 1"); `add` / no-delta keep the existing floor-0.
- The delta die is rolled **after** the weapon dice, so a normal-size attacker's loop is empty and draws **no extra RNG** — every existing weapon attack is byte-identical, and at a fixed seed `sized = baseline ± delta`.

Deferred (minor): the delta die isn't **crit-doubled** (the weapon dice still double on a crit; the ±1d4 is applied flat).

## What shipped

- `WeaponDamageDelta` on the `EffectSchema` union + `EFFECT_KINDS`; the `addWeaponDamageDelta` / `weaponDamageDeltas` accumulator on `EffectAccumulator`; the apply case in `builder.ts`; the delta application in `planAttack` (`attack.ts`).
- Content: `enlarged-active` / `reduced-active` gain the rider; their descriptions + engineNotes refreshed (the "not modeled yet" notes are gone). No new condition (the conditions were already wired).
- New 4-test `tests/unit/engine/slice-875-enlarge-reduce-damage.test.ts`: the conditions carry the riders; an enlarged attacker deals exactly +1d4 (1–4) over baseline at the same seed; a reduced attacker deals 1–4 less; and a reduced STR-10 dagger wielder never drops below 1 (the floor).
- Counts: EFFECT_KINDS primitives `69 → 70` / total `70 → 71`, reconciled across README ×3 / status / architecture / api-overview / concepts / authoring-content-packs; `release:doc-review` reports "primitive count 70 (+ Custom = 71) MATCHES".

## Verification

`npx tsc --noEmit` clean; new 4-test slice-875 green. `npm run test:fast` (652 files, 4876 passed — +1 file / +4 tests over slice 874). exports + the attack goldens are byte-unchanged (the delta loop is empty, drawing no RNG, for every normal-size attacker). doc-counts + doc-size + doc-links + `release:doc-review` green.
