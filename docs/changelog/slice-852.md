# Slice 852 — Banishment: CHA save → Incapacitated (concentration-bound)

**Type:** Engine (one line in the action-block set) + content. Closes the [L7 audit](../l7-completion-audit.md) Area-2 divergence `l4-banishment`.

## The divergence

RAW (SRD 5.2.1 Banishment):

> One creature that you can see within range must succeed on a Charisma saving throw or be transported to a harmless demiplane for the duration. While there, the target has the Incapacitated condition. When the spell ends, the target reappears in the space it left.

The spell shipped with `mechanicalEffects: []` — a cast emitted no save and did nothing; the target just stood there.

## The fix

RAW's *only* mechanical hook is "the target has the Incapacitated condition," so this is a thin, faithful wire:

- **Content:** the spell mechanic is now `{ kind: 'save', ability: 'CHA', conditionOnFail: 'banished-active' }`. A new `banished-active` condition ships with `effects: []` (its mechanical effect is purely the action-block) and `autoExpiry { afterRounds: 10, trigger: 'turnEnd' }` (the 1-minute cap).
- **Engine:** `banished-active` is added to `ACTION_BLOCKING_CONDITIONS` in `_actor-state.ts` — the exact path `held-paralyzed-active` / `sleep-drowsy-active` use for spell-bound conditions that RAW-include Incapacitated. So a banished creature can't take actions, Bonus Actions, or Reactions (every on-turn planner calls `assertActorCanAct`).
- **Concentration:** Banishment concentrates, so `planSaveMechanic` stamps the failed-save condition with the concentration effect id (`sourceEffectInstanceId`). When the caster's Concentration ends — drops, or is replaced by a new Concentration spell — the engine's `clearConcentrationEffect` sweep lifts `banished-active`, and **the target returns**.

`banished-active` joins the `EFFECT_LESS_OK` allowlist (pack-integrity), alongside `incapacitated` / `sleep-drowsy-active`, since its mechanic lives in engine code, not the effects array.

## Deferred (consumer / positional / narrative)

The engine models the RAW-stated Incapacitated. The rest is the consumer's scene/plane model:

- the **demiplane removal itself** — a banished creature can't be targeted or affected from the normal plane; the engine has no plane/position model, so the consumer removes it from the targetable set.
- the **reappear-in-the-nearest-unoccupied-space** placement.
- the **Aberration / Celestial / Elemental / Fey / Fiend** arm ("doesn't return if the spell lasts 1 minute; transported to a random plane") — no plane model.
- the upcast **"+1 target per slot"** (a target-count rule on the targeting seam, Area 3).

## What shipped

New 5-test `tests/unit/engine/slice-852-banishment.test.ts`: the spell is a concentration CHA save applying `banished-active`; `banished-active` is `effects: []` + a member of `ACTION_BLOCKING_CONDITIONS` + the 10-round cap; a failed CHA save banishes the target (condition applied, `sourceEffectInstanceId` set, ConcentrationStarted, `findActorBlockingCondition` returns it); a successful save leaves it unaffected; and casting a second Concentration spell drops Banishment so the target returns. Seed 1 gives a save d20 of 10 vs DC 15 (wizard L7, INT 18); a CHA-4 Rogue (−3) fails and a CHA-20 Rogue (+5) succeeds. `spell-coverage` flips `banishment` skip → save.

## Verification

`npx tsc --noEmit` clean; new 5-test slice-852 green; pack-integrity (the `EFFECT_LESS_OK` audit) green. +1 condition (172 → 173; rider 157 → 158; carry-effects count unchanged — `banished-active` is effect-less) — getting-started / status / starter-pack-gaps counts bumped; coverage snapshot unchanged (effect-less conditions aren't in the wired catalog). `npm run test:fast` + doc audits green.
