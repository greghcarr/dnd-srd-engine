# Slice 804 — Armor Training penalties (untrained armor)

**Type:** Engine derivation + planner gates (read an authored-but-ignored field across five sites). **Closes** the [L7 audit](../l7-completion-audit.md) Area 6 divergence `untrained-armor-penalty`.

## The gap

The class `armorProficiencies` arrays were authored but **never read**, so the RAW Armor Training penalties (equipment.md) didn't apply: a Wizard in Plate rolled Strength/Dexterity normally, cast freely, and a shield gave +2 AC to anyone. RAW:

> *"If you wear Light, Medium, or Heavy armor and lack training with it, you have Disadvantage on any D20 Test that involves Strength or Dexterity, and you can't cast spells."* … *"You gain the Armor Class benefit of a Shield only if you have training with it."*

## The fix

A new `src/derive/armor-training.ts` resolves training the same way `isWeaponProficient` resolves weapon proficiency — over the character's classes' proficiency arrays — **plus** the effect stack's `proficiencyLevel('armor', …)` so a feat / subclass / species grant counts. It exports `isArmorTrained`, `wearsUntrainedBodyArmor` (Light/Medium/Heavy you lack training with), and `wieldsUntrainedShield`.

The three RAW effects are applied at the five places they manifest, each reusing the existing advantage/disadvantage or gate machinery:

| Arm | Site |
|---|---|
| Disadvantage on STR/DEX **checks** | `derive/ability-check.ts` — OR-ed into the check's disadvantage when `ability ∈ {STR, DEX}` |
| Disadvantage on STR/DEX **saves** | `derive/save.ts` — same, into the save's effective disadvantage |
| Disadvantage on weapon **attacks** | `engine/plan/attack.ts` — into `targetImposesDisadvantage`, beside the slice-782 Heavy-weapon rule (a weapon attack roll uses a STR/DEX mod) |
| Can't **cast spells** | `engine/plan/cast-spell.ts` — `planCastSpell` throws up front |
| **Shield** gives no AC | `derive/ac.ts` — the shield block is gated on shield training |

Monsters are unaffected (they use an `armorClass` override, not equipped armor instances).

## Tests

`tests/unit/engine/slice-804-untrained-armor.test.ts` (6): a Wizard (no armor training) in Chain Mail gets Disadvantage on STR/DEX checks and saves (not INT/CON) and on weapon attack rolls (`used: 'disadvantage'`, two d20s), and can't cast (`throws /armor/`); a Fighter (trained) in the same armor gets none of it; an untrained Shield contributes no AC while a trained one gives +2. The slice-798 stealth test was switched from a Rogue to a Fighter so its armor is *trained* — isolating the stealth-specific arm from this new untrained-armor one (a Rogue in Splint now correctly eats both).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (587 files, 4524 passed) — no other armored-character test regressed.
