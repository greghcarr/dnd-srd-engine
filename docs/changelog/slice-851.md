# Slice 851 — Resilient Sphere: encloses (DEX save if unwilling) + total damage immunity

**Type:** Content (no source/schema change). Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-resilient-sphere`.

## The divergence

RAW (SRD 5.2.1 Resilient Sphere):

> A shimmering sphere encloses a Large or smaller creature or object within range. An unwilling creature must succeed on a Dexterity saving throw or be enclosed for the duration. ... The sphere is immune to all damage, and a creature or object inside can't be damaged by attacks or effects originating from outside, nor can a creature inside the sphere damage anything outside it.

The spell shipped with `mechanicalEffects: []` — casting it did nothing: no save, no condition, no effect. An expert sees a 4th-level slot vanish with zero result.

## The fix — content only

Both primitives needed already shipped, so there is **no engine, schema, or event change**:

- **Cast arm** — the slice-849 **unwilling-save-on-buff**: `{ kind: 'buff', conditionId: 'resilient-sphere-enclosed', unwillingSave: { ability: 'DEX' } }`. A **willing** target (the common ally-protection case) is enclosed with no save; an **unwilling** target — named by the consumer in `intent.unwillingTargetIds` (willingness is consumer-owned, like cover) — rolls a DEX save vs the caster's spell save DC and is enclosed only on a failure. With the spell's `concentration: true`, the buff mechanic threads the condition onto `ConcentrationStarted`, so it lifts when the caster's Concentration drops.
- **Effect arm** — the new `resilient-sphere-enclosed` condition carries `{ kind: 'GrantImmunity', damageType: 'all' }`. `mitigateDamage` already short-circuits any component to `{ amount: 0, mitigation: 'immune' }` when `hasImmunity` is true, and `hasImmunity` returns true for an `'all'` grant — so the trapped creature takes **0 from every damage source**. `autoExpiry { afterRounds: 10, trigger: 'turnEnd' }` caps the 1-minute duration.

The engine doesn't model positions, so treating *every* attacker as "outside" is exactly right for the sphere: nothing can damage the enclosed creature.

## Deferred (positional / narrative, consumer-owned)

- The reciprocal **"can't damage anything outside"** arm — the engine can't tell inside from outside without positions (the same boundary as every other positional spell arm).
- The seal against **incoming non-damage effects**, the **roll-at-half-speed** movement, and the **Disintegrate-destroys-the-globe** special case.

## What shipped

New 6-test `tests/unit/engine/slice-851-resilient-sphere.test.ts`: the spell is a concentration buff applying `resilient-sphere-enclosed` with a DEX `unwillingSave`; the condition grants immunity to all damage + the 10-round cap; a willing target is enclosed with no save and the caster concentrates; the enclosed creature takes 0 from both fire (magical) and slashing (physical) via `mitigateDamage`; an unwilling target that **fails** the DEX save is enclosed and one that **succeeds** is not. Seed 1 gives a save d20 of 10 vs DC 15 (wizard L7, INT 18); a DEX-4 Rogue (−1 with save prof) fails and a DEX-20 Rogue (+7) succeeds. `spell-coverage` flips `resilient-sphere` from `skip` to a `buff`.

## Verification

`npx tsc --noEmit` clean; new 6-test slice-851 green. +1 condition (171 → 172; rider 156 → 157) — getting-started / status / starter-pack-gaps counts bumped; coverage snapshot gains `resilient-sphere-enclosed` (`-u`). `npm run test:fast` + doc audits green.
