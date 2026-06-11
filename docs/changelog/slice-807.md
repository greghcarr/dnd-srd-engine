# Slice 807 — Charmed: can't harm the charmer (spells) + social advantage

**Type:** Engine planner gate + a consumer-coordinated ability-check fact. **Closes** the [L7 audit](../l7-completion-audit.md) Area 4 divergence `charmed-harmful-target-arm` — the **last** Area 4 divergence.

## The gap

The `charmed` condition carried 0 effects; both RAW arms (rules-glossary "Charmed") were only partly enforced:

> *"You can't attack the charmer or target the charmer with damaging abilities or magical effects."* … *"The charmer has Advantage on any ability check to interact with you socially."*

The engine blocked **weapon** attacks on the charmer (attack.ts) but a Charmed caster could still fire a harmful spell at the charmer; and the social-advantage arm was unmodeled.

## The fix

- **Can't Harm (spells)** — `planCastSpell` now mirrors the weapon gate: if the caster carries a `charmed` condition sourced by an explicit target and the spell is harmful (carries an `attack` or `save` mechanic), the cast throws. Gated on **explicit targets** — an AoE the charmer merely stands in (area-enforced membership via `aim`) isn't "targeting" them, so it's allowed. Beneficial spells (no attack/save — a heal/buff like Mage Armor) on the charmer are fine.
- **Social Advantage** — the engine has no social-interaction model (an ability check carries no target creature), so this is a consumer-coordinated fact: new `ComputeAbilityCheckInput.socialCheckTargetId`. When set, the named creature is Charmed by the checker, and the skill is social (Persuasion / Deception / Intimidation / Performance), the check gains Advantage (resolved against `characters`). Omitted → no such advantage.

Both arms key on the `AppliedCondition.sourceCharacterId` (who charmed whom), so the `charmed` condition stays effect-less — consistent with how the weapon-attack block already works.

## Tests

`tests/unit/engine/slice-807-charmed-harmful.test.ts` (3): a Charmed caster can't Fire Bolt the charmer (`/cannot target them/`) but can Fire Bolt a bystander and can Mage Armor the charmer; and the charmer gets Advantage on a Persuasion check directed at the charmed creature, but not without the designated target, against a non-charmed target, or on a non-social skill (Athletics).

## Verification

`npx tsc --noEmit` clean; `npm run test:fast` green (590 files, 4535 passed).
